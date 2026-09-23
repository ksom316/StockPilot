-- StockPilot Phase 11A: deterministic Business Opportunity Advisor foundation.
-- Opportunities are review signals from recorded StockPilot data, never
-- forecasts, guarantees, or AI-generated recommendations.

create function public.get_business_opportunities(
  p_business_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.business_role;
  v_timezone text;
  v_currency text;
  v_today date;
  v_observation_start_date date;
  v_comparison_start_date date;
  v_observation_start timestamptz;
  v_comparison_start timestamptz;
  v_window_end timestamptz;
  v_sales_enabled boolean;
  v_purchasing_enabled boolean;
  v_finance_enabled boolean;
  v_smart_insights_enabled boolean;
  v_sales_observable_from timestamptz;
  v_purchasing_observable_from timestamptz;
  v_signals jsonb;
  v_total_signals bigint;
  v_active_products bigint;
  v_sales_30_eligible bigint;
  v_sales_60_eligible bigint;
  v_purchasing_30_eligible bigint;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;

  if p_business_id is null then
    raise exception 'A business is required' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100' using errcode = '22023';
  end if;

  v_role := private.active_business_role(p_business_id);
  if v_role is null then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'manager') then
    raise exception 'Business Opportunity Advisor access is required' using errcode = '42501';
  end if;

  select business.timezone, business.currency
  into v_timezone, v_currency
  from public.businesses as business
  where business.id = p_business_id;

  select
    coalesce(bool_or(module.enabled) filter (where module.module = 'sales'), false),
    coalesce(bool_or(module.enabled) filter (where module.module = 'purchasing'), false),
    coalesce(bool_or(module.enabled) filter (where module.module = 'expenses'), false),
    coalesce(bool_or(module.enabled) filter (where module.module = 'smart_insights'), false),
    max(module.updated_at) filter (where module.module = 'sales'),
    max(module.updated_at) filter (where module.module = 'purchasing')
  into v_sales_enabled, v_purchasing_enabled, v_finance_enabled,
    v_smart_insights_enabled, v_sales_observable_from,
    v_purchasing_observable_from
  from public.business_modules as module
  where module.business_id = p_business_id;

  if not v_smart_insights_enabled then
    raise exception 'Smart Insights is not enabled for this business' using errcode = '42501';
  end if;

  v_today := (statement_timestamp() at time zone v_timezone)::date;
  v_observation_start_date := v_today - 30;
  v_comparison_start_date := v_today - 60;
  v_observation_start := v_observation_start_date::timestamp at time zone v_timezone;
  v_comparison_start := v_comparison_start_date::timestamp at time zone v_timezone;
  v_window_end := v_today::timestamp at time zone v_timezone;

  with product_facts as materialized (
    select product.id, product.name, product.sku, product.current_quantity,
      product.low_stock_threshold,
      case
        when product.current_quantity = 0 then 'OUT_OF_STOCK'
        when product.current_quantity > 0
          and product.current_quantity <= product.low_stock_threshold then 'LOW_STOCK'
        else 'IN_STOCK'
      end as stock_state,
      case
        when (product.created_at at time zone v_timezone)::time = time '00:00:00'
          then (product.created_at at time zone v_timezone)::date
        else (product.created_at at time zone v_timezone)::date + 1
      end as product_observable_date,
      case
        when not v_sales_enabled then null::date
        else greatest(
          case
            when (product.created_at at time zone v_timezone)::time = time '00:00:00'
              then (product.created_at at time zone v_timezone)::date
            else (product.created_at at time zone v_timezone)::date + 1
          end,
          case
            when (v_sales_observable_from at time zone v_timezone)::time = time '00:00:00'
              then (v_sales_observable_from at time zone v_timezone)::date
            else (v_sales_observable_from at time zone v_timezone)::date + 1
          end
        )
      end as sales_observable_date,
      case
        when not v_purchasing_enabled then null::date
        else greatest(
          case
            when (product.created_at at time zone v_timezone)::time = time '00:00:00'
              then (product.created_at at time zone v_timezone)::date
            else (product.created_at at time zone v_timezone)::date + 1
          end,
          case
            when (v_purchasing_observable_from at time zone v_timezone)::time = time '00:00:00'
              then (v_purchasing_observable_from at time zone v_timezone)::date
            else (v_purchasing_observable_from at time zone v_timezone)::date + 1
          end
        )
      end as purchasing_observable_date
    from public.products as product
    where product.business_id = p_business_id and product.is_active
  ),
  sales_facts as materialized (
    select product.id as product_id,
      coalesce(sum(item.quantity) filter (
        where sale.sold_at >= v_observation_start and sale.sold_at < v_window_end
      ), 0)::numeric as recent_quantity,
      count(distinct (sale.sold_at at time zone v_timezone)::date) filter (
        where sale.sold_at >= v_observation_start and sale.sold_at < v_window_end
      )::integer as recent_sale_dates,
      coalesce(sum(item.quantity) filter (
        where sale.sold_at >= v_comparison_start and sale.sold_at < v_observation_start
      ), 0)::numeric as comparison_quantity,
      count(distinct (sale.sold_at at time zone v_timezone)::date) filter (
        where sale.sold_at >= v_comparison_start and sale.sold_at < v_observation_start
      )::integer as comparison_sale_dates,
      count(item.id) filter (
        where sale.sold_at >= v_observation_start and sale.sold_at < v_window_end
      )::bigint as recent_item_count,
      count(item.estimated_unit_cost_basis) filter (
        where sale.sold_at >= v_observation_start and sale.sold_at < v_window_end
      )::bigint as recent_costed_item_count,
      coalesce(sum(item.line_total) filter (
        where sale.sold_at >= v_observation_start and sale.sold_at < v_window_end
      ), 0)::numeric(19,4) as recent_recorded_sales,
      coalesce(sum(round(item.quantity * item.estimated_unit_cost_basis, 4)) filter (
        where sale.sold_at >= v_observation_start and sale.sold_at < v_window_end
          and item.estimated_unit_cost_basis is not null
      ), 0)::numeric(19,4) as recent_estimated_cost
    from product_facts as product
    left join public.sale_items as item
      on v_sales_enabled and item.business_id = p_business_id and item.product_id = product.id
    left join public.sales as sale
      on sale.business_id = p_business_id and sale.id = item.sale_id
      and sale.sold_at >= v_comparison_start and sale.sold_at < v_window_end
    group by product.id
  ),
  purchase_facts as materialized (
    select product.id as product_id,
      coalesce(sum(item.quantity) filter (where purchase.id is not null), 0)::numeric as received_quantity,
      count(distinct purchase.id)::bigint as receipt_count,
      count(distinct (purchase.received_at at time zone v_timezone)::date)::integer as receipt_dates
    from product_facts as product
    left join public.purchase_items as item
      on v_purchasing_enabled and item.business_id = p_business_id and item.product_id = product.id
    left join public.purchases as purchase
      on purchase.business_id = p_business_id and purchase.id = item.purchase_id
      and purchase.received_at >= v_observation_start and purchase.received_at < v_window_end
    group by product.id
  ),
  facts as materialized (
    select product.*,
      sales.recent_quantity, sales.recent_sale_dates,
      sales.comparison_quantity, sales.comparison_sale_dates,
      sales.recent_item_count, sales.recent_costed_item_count,
      sales.recent_recorded_sales, sales.recent_estimated_cost,
      purchases.received_quantity, purchases.receipt_count, purchases.receipt_dates,
      v_sales_enabled and product.sales_observable_date <= v_observation_start_date as sales_30_complete,
      v_sales_enabled and product.sales_observable_date <= v_comparison_start_date as sales_60_complete,
      v_purchasing_enabled and product.purchasing_observable_date <= v_observation_start_date as purchasing_30_complete
    from product_facts as product
    join sales_facts as sales on sales.product_id = product.id
    join purchase_facts as purchases on purchases.product_id = product.id
  ),
  candidate_signals as materialized (
    select 1 as type_rank,
      case when fact.current_quantity = 0 then 1 else 2 end as priority_rank,
      fact.name as product_sort, fact.id as product_sort_id,
      jsonb_build_object(
        'signalId', 'RESTOCK_DEMAND:' || fact.id::text,
        'type', 'RESTOCK_DEMAND',
        'priority', case when fact.current_quantity = 0 then 'HIGH' else 'MEDIUM' end,
        'title', 'Review replenishment for ' || fact.name,
        'summary', 'Recorded demand is present while current stock needs attention.',
        'product', jsonb_build_object('id', fact.id, 'name', fact.name, 'sku', fact.sku),
        'observationPeriod', jsonb_build_object('startDate', v_observation_start_date, 'endDate', v_today - 1, 'completedBusinessDates', 30),
        'comparisonPeriod', null,
        'eligibility', jsonb_build_object('status', 'ELIGIBLE', 'rule', '30 completed dates, at least 3 sale dates, positive Recorded Sales quantity, and low/out stock'),
        'evidence', jsonb_build_object(
          'currentQuantity', fact.current_quantity::text,
          'lowStockThreshold', fact.low_stock_threshold::text,
          'stockState', fact.stock_state,
          'recordedSalesQuantity', fact.recent_quantity::text,
          'distinctSaleDates', fact.recent_sale_dates
        ),
        'limitations', jsonb_build_array('Recorded demand does not guarantee future demand; current stock is a point-in-time value.')
      ) as signal
    from facts as fact
    where fact.sales_30_complete and fact.recent_quantity > 0
      and fact.recent_sale_dates >= 3
      and (fact.current_quantity = 0 or (fact.current_quantity > 0 and fact.current_quantity <= fact.low_stock_threshold))

    union all

    select 2,
      case when fact.recent_quantity >= fact.comparison_quantity * 2 and fact.recent_quantity - fact.comparison_quantity >= 5 then 1 else 2 end,
      fact.name, fact.id,
      jsonb_build_object(
        'signalId', 'SALES_MOMENTUM:' || fact.id::text,
        'type', 'SALES_MOMENTUM',
        'priority', case when fact.recent_quantity >= fact.comparison_quantity * 2 and fact.recent_quantity - fact.comparison_quantity >= 5 then 'HIGH' else 'MEDIUM' end,
        'title', 'Review recent sales momentum for ' || fact.name,
        'summary', 'Recent Recorded Sales quantity is materially higher than the preceding completed period.',
        'product', jsonb_build_object('id', fact.id, 'name', fact.name, 'sku', fact.sku),
        'observationPeriod', jsonb_build_object('startDate', v_observation_start_date, 'endDate', v_today - 1, 'completedBusinessDates', 30),
        'comparisonPeriod', jsonb_build_object('startDate', v_comparison_start_date, 'endDate', v_observation_start_date - 1, 'completedBusinessDates', 30),
        'eligibility', jsonb_build_object('status', 'ELIGIBLE', 'rule', '60 completed dates, positive comparison demand, at least 3 recent sale dates, at least 50% growth, and at least 2 additional units'),
        'evidence', jsonb_build_object(
          'recentRecordedSalesQuantity', fact.recent_quantity::text,
          'comparisonRecordedSalesQuantity', fact.comparison_quantity::text,
          'quantityIncrease', (fact.recent_quantity - fact.comparison_quantity)::text,
          'recentDistinctSaleDates', fact.recent_sale_dates,
          'comparisonDistinctSaleDates', fact.comparison_sale_dates
        ),
        'limitations', jsonb_build_array('Recorded momentum is historical and does not predict future sales.')
      )
    from facts as fact
    where fact.sales_60_complete and fact.comparison_quantity > 0
      and fact.recent_sale_dates >= 3
      and fact.recent_quantity >= fact.comparison_quantity * 1.5
      and fact.recent_quantity - fact.comparison_quantity >= 2

    union all

    select 3,
      case when fact.current_quantity >= greatest(fact.low_stock_threshold * 2, 1::numeric) then 2 else 3 end,
      fact.name, fact.id,
      jsonb_build_object(
        'signalId', 'SLOW_MOVING_STOCK:' || fact.id::text,
        'type', 'SLOW_MOVING_STOCK',
        'priority', case when fact.current_quantity >= greatest(fact.low_stock_threshold * 2, 1::numeric) then 'MEDIUM' else 'LOW' end,
        'title', 'Review stock activity for ' || fact.name,
        'summary', 'Stock is on hand with no Recorded Sales in the completed observation period.',
        'product', jsonb_build_object('id', fact.id, 'name', fact.name, 'sku', fact.sku),
        'observationPeriod', jsonb_build_object('startDate', v_observation_start_date, 'endDate', v_today - 1, 'completedBusinessDates', 30),
        'comparisonPeriod', null,
        'eligibility', jsonb_build_object('status', 'ELIGIBLE', 'rule', '30 completed dates, positive current stock, and zero Recorded Sales quantity'),
        'evidence', jsonb_build_object(
          'currentQuantity', fact.current_quantity::text,
          'lowStockThreshold', fact.low_stock_threshold::text,
          'recordedSalesQuantity', fact.recent_quantity::text,
          'distinctSaleDates', fact.recent_sale_dates
        ),
        'limitations', jsonb_build_array('No Recorded Sales is not proof that stock cannot sell; activity outside StockPilot is unavailable.')
      )
    from facts as fact
    where fact.sales_30_complete and fact.current_quantity > 0 and fact.recent_quantity = 0

    union all

    select 4,
      case when fact.recent_recorded_sales - fact.recent_estimated_cost <= 0 then 1 else 2 end,
      fact.name, fact.id,
      jsonb_build_object(
        'signalId', 'MARGIN_ATTENTION:' || fact.id::text,
        'type', 'MARGIN_ATTENTION',
        'priority', case when fact.recent_recorded_sales - fact.recent_estimated_cost <= 0 then 'HIGH' else 'MEDIUM' end,
        'title', 'Review estimated margin for ' || fact.name,
        'summary', 'Fully cost-covered Recorded Sales show an estimated gross margin below 15%.',
        'product', jsonb_build_object('id', fact.id, 'name', fact.name, 'sku', fact.sku),
        'observationPeriod', jsonb_build_object('startDate', v_observation_start_date, 'endDate', v_today - 1, 'completedBusinessDates', 30),
        'comparisonPeriod', null,
        'eligibility', jsonb_build_object('status', 'ELIGIBLE', 'rule', 'Finance and Sales enabled, 30 completed dates, at least 3 sale dates, positive revenue, complete estimated cost coverage, and estimated gross margin below 15%'),
        'evidence', jsonb_build_object(
          'recordedSales', fact.recent_recorded_sales::text,
          'estimatedProductCost', fact.recent_estimated_cost::text,
          'estimatedGrossProfit', (fact.recent_recorded_sales - fact.recent_estimated_cost)::numeric(19,4)::text,
          'estimatedGrossMarginPercent', round(((fact.recent_recorded_sales - fact.recent_estimated_cost) / fact.recent_recorded_sales) * 100, 6)::text,
          'saleItemCount', fact.recent_item_count,
          'costedSaleItemCount', fact.recent_costed_item_count
        ),
        'limitations', jsonb_build_array('Product cost is an estimated sale-time snapshot, not accounting COGS or inventory valuation.')
      )
    from facts as fact
    where v_finance_enabled and fact.sales_30_complete
      and fact.recent_sale_dates >= 3 and fact.recent_recorded_sales > 0
      and fact.recent_item_count > 0
      and fact.recent_item_count = fact.recent_costed_item_count
      and ((fact.recent_recorded_sales - fact.recent_estimated_cost) / fact.recent_recorded_sales) < 0.15

    union all

    select 5,
      case when fact.stock_state in ('OUT_OF_STOCK', 'LOW_STOCK') then 1 else 2 end,
      fact.name, fact.id,
      jsonb_build_object(
        'signalId', 'REPEATED_PURCHASE_DEMAND:' || fact.id::text,
        'type', 'REPEATED_PURCHASE_DEMAND',
        'priority', case when fact.stock_state in ('OUT_OF_STOCK', 'LOW_STOCK') then 'HIGH' else 'MEDIUM' end,
        'title', 'Review recurring replenishment for ' || fact.name,
        'summary', 'Repeated receipts and recurring Recorded Sales appear in the completed observation period.',
        'product', jsonb_build_object('id', fact.id, 'name', fact.name, 'sku', fact.sku),
        'observationPeriod', jsonb_build_object('startDate', v_observation_start_date, 'endDate', v_today - 1, 'completedBusinessDates', 30),
        'comparisonPeriod', null,
        'eligibility', jsonb_build_object('status', 'ELIGIBLE', 'rule', 'Sales and Purchasing enabled for 30 completed dates, at least 2 receipts, at least 3 sale dates, and positive received/sold quantities'),
        'evidence', jsonb_build_object(
          'receivedQuantity', fact.received_quantity::text,
          'receiptCount', fact.receipt_count,
          'distinctReceiptDates', fact.receipt_dates,
          'recordedSalesQuantity', fact.recent_quantity::text,
          'distinctSaleDates', fact.recent_sale_dates,
          'currentQuantity', fact.current_quantity::text,
          'stockState', fact.stock_state
        ),
        'limitations', jsonb_build_array('Repeated recorded activity suggests a review need, not guaranteed future demand.')
      )
    from facts as fact
    where fact.sales_30_complete and fact.purchasing_30_complete
      and fact.receipt_count >= 2 and fact.received_quantity > 0
      and fact.recent_sale_dates >= 3 and fact.recent_quantity > 0
  ),
  ordered_signals as materialized (
    select candidate.signal, candidate.priority_rank, candidate.type_rank,
      candidate.product_sort, candidate.product_sort_id,
      row_number() over (
        order by candidate.priority_rank, candidate.type_rank,
          lower(candidate.product_sort), candidate.product_sort, candidate.product_sort_id
      ) as ordinal
    from candidate_signals as candidate
  ),
  counts as (
    select
      (select count(*) from product_facts)::bigint as active_products,
      (select count(*) from facts where sales_30_complete)::bigint as sales_30_eligible,
      (select count(*) from facts where sales_60_complete)::bigint as sales_60_eligible,
      (select count(*) from facts where purchasing_30_complete)::bigint as purchasing_30_eligible,
      (select count(*) from ordered_signals)::bigint as total_signals
  )
  select
    coalesce((select jsonb_agg(signal order by ordinal) from ordered_signals where ordinal <= p_limit), '[]'::jsonb),
    counts.total_signals, counts.active_products, counts.sales_30_eligible,
    counts.sales_60_eligible, counts.purchasing_30_eligible
  into v_signals, v_total_signals, v_active_products, v_sales_30_eligible,
    v_sales_60_eligible, v_purchasing_30_eligible
  from counts;

  return jsonb_build_object(
    'schemaVersion', 1,
    'asOfBusinessDate', v_today,
    'timezone', v_timezone,
    'currency', v_currency,
    'module', 'smart_insights',
    'disclaimer', 'Deterministic review signals from recorded StockPilot data; opportunities are not predictions or guarantees.',
    'periods', jsonb_build_object(
      'observation', jsonb_build_object('startDate', v_observation_start_date, 'endDate', v_today - 1, 'completedBusinessDates', 30),
      'comparison', jsonb_build_object('startDate', v_comparison_start_date, 'endDate', v_observation_start_date - 1, 'completedBusinessDates', 30),
      'currentPartialDateExcluded', true
    ),
    'modules', jsonb_build_object(
      'inventory', 'AVAILABLE',
      'sales', case when v_sales_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end,
      'purchasing', case when v_purchasing_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end,
      'finance', case when v_finance_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end,
      'smartInsights', 'AVAILABLE'
    ),
    'eligibility', jsonb_build_object(
      'activeProductCount', v_active_products,
      'categories', jsonb_build_object(
        'RESTOCK_DEMAND', jsonb_build_object(
          'status', case when v_sales_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end,
          'eligibleProductCount', case when v_sales_enabled then v_sales_30_eligible else 0 end,
          'insufficientHistoryProductCount', case when v_sales_enabled then v_active_products - v_sales_30_eligible else null end
        ),
        'SALES_MOMENTUM', jsonb_build_object(
          'status', case when v_sales_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end,
          'eligibleProductCount', case when v_sales_enabled then v_sales_60_eligible else 0 end,
          'insufficientHistoryProductCount', case when v_sales_enabled then v_active_products - v_sales_60_eligible else null end
        ),
        'SLOW_MOVING_STOCK', jsonb_build_object(
          'status', case when v_sales_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end,
          'eligibleProductCount', case when v_sales_enabled then v_sales_30_eligible else 0 end,
          'insufficientHistoryProductCount', case when v_sales_enabled then v_active_products - v_sales_30_eligible else null end
        ),
        'MARGIN_ATTENTION', jsonb_build_object(
          'status', case when not v_sales_enabled then 'SALES_MODULE_DISABLED' when not v_finance_enabled then 'FINANCE_MODULE_DISABLED' else 'AVAILABLE' end,
          'eligibleProductCount', case when v_sales_enabled and v_finance_enabled then v_sales_30_eligible else 0 end
        ),
        'REPEATED_PURCHASE_DEMAND', jsonb_build_object(
          'status', case when not v_sales_enabled then 'SALES_MODULE_DISABLED' when not v_purchasing_enabled then 'PURCHASING_MODULE_DISABLED' else 'AVAILABLE' end,
          'eligibleProductCount', case when v_sales_enabled and v_purchasing_enabled then least(v_sales_30_eligible, v_purchasing_30_eligible) else 0 end
        )
      )
    ),
    'selection', jsonb_build_object(
      'limit', p_limit,
      'totalSignals', v_total_signals,
      'returnedSignals', jsonb_array_length(v_signals),
      'truncated', v_total_signals > p_limit,
      'ordering', 'PRIORITY_THEN_TYPE_THEN_PRODUCT_NAME'
    ),
    'signals', v_signals,
    'limitations', jsonb_build_array(
      'Signals use only recorded StockPilot activity and may not reflect activity recorded elsewhere.',
      'Current stock is a point-in-time value; the observation and comparison periods exclude the current partial business date.',
      'Products without sufficient observable history are excluded from conclusions rather than treated as zero activity.'
    )
  );
end;
$$;

revoke all on function public.get_business_opportunities(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_business_opportunities(uuid, integer)
  to authenticated;

comment on function public.get_business_opportunities(uuid, integer) is
  'Owner/manager-only deterministic opportunity signals under Smart Insights. Uses completed business-local dates, explicit module/data eligibility, bounded stable ordering, exact decimal strings, and aggregated product evidence without customer, supplier, or private-note data.';
