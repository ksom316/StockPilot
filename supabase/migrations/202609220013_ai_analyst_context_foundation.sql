-- StockPilot Phase 10A: deterministic, permission-safe AI Analyst context.
-- This migration does not call an AI provider and does not persist prompts,
-- questions, business context, or model answers.

insert into public.business_modules (business_id, module, enabled)
select business.id, 'ai_analyst'::public.optional_module, false
from public.businesses as business
on conflict (business_id, module) do nothing;

create function public.get_ai_analyst_context(
  p_business_id uuid,
  p_period text
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
  v_start_date date;
  v_end_date date;
  v_overview jsonb;
  v_sales_enabled boolean;
  v_purchasing_enabled boolean;
  v_expenses_enabled boolean;
  v_smart_insights_enabled boolean;
  v_ai_analyst_enabled boolean;
  v_inventory_attention jsonb;
  v_inventory_attention_count bigint;
  v_finance record;
  v_finance_context jsonb;
  v_smart_inventory_context jsonb;
  v_limitations jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;

  if p_business_id is null then
    raise exception 'A business is required' using errcode = '22023';
  end if;

  v_role := private.active_business_role(p_business_id);
  if v_role is null then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'manager') then
    raise exception 'AI Analyst access is required' using errcode = '42501';
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
    coalesce(bool_or(module.enabled) filter (where module.module = 'ai_analyst'), false)
  into v_sales_enabled, v_purchasing_enabled, v_expenses_enabled,
    v_smart_insights_enabled, v_ai_analyst_enabled
  from public.business_modules as module
  where module.business_id = p_business_id;

  if not v_ai_analyst_enabled then
    raise exception 'AI Analyst is not enabled for this business' using errcode = '42501';
  end if;

  if p_period is null or p_period not in (
    'TODAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_30_COMPLETED_DAYS'
  ) then
    raise exception 'Unsupported AI Analyst period' using errcode = '22023';
  end if;

  v_today := (statement_timestamp() at time zone v_timezone)::date;
  case p_period
    when 'TODAY' then
      v_start_date := v_today;
      v_end_date := v_today;
    when 'THIS_WEEK' then
      v_start_date := v_today - (extract(isodow from v_today)::integer - 1);
      v_end_date := v_start_date + 6;
    when 'THIS_MONTH' then
      v_start_date := date_trunc('month', v_today)::date;
      v_end_date := (date_trunc('month', v_today) + interval '1 month - 1 day')::date;
    when 'LAST_30_COMPLETED_DAYS' then
      v_start_date := v_today - 30;
      v_end_date := v_today - 1;
  end case;

  -- Reuse the authoritative operational aggregate contract. The context only
  -- reshapes its bounded output and removes internal product identifiers.
  v_overview := public.get_business_overview(p_business_id, v_start_date, v_end_date);

  select count(*)::bigint
  into v_inventory_attention_count
  from public.products as product
  where product.business_id = p_business_id
    and product.is_active
    and (
      product.current_quantity = 0
      or (product.current_quantity > 0 and product.current_quantity <= product.low_stock_threshold)
    );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'productName', selected.name,
      'productSku', selected.sku,
      'currentQuantity', selected.current_quantity::text,
      'lowStockThreshold', selected.low_stock_threshold::text,
      'stockState', selected.stock_state
    ) order by selected.stock_priority, lower(selected.name), selected.name, selected.id
  ), '[]'::jsonb)
  into v_inventory_attention
  from (
    select product.id, product.name, product.sku, product.current_quantity,
      product.low_stock_threshold,
      case when product.current_quantity = 0 then 'OUT_OF_STOCK' else 'LOW_STOCK' end as stock_state,
      case when product.current_quantity = 0 then 0 else 1 end as stock_priority
    from public.products as product
    where product.business_id = p_business_id
      and product.is_active
      and (
        product.current_quantity = 0
        or (product.current_quantity > 0 and product.current_quantity <= product.low_stock_threshold)
      )
    order by stock_priority, lower(product.name), product.name, product.id
    limit 20
  ) as selected;

  if v_expenses_enabled then
    select * into v_finance
    from public.get_financial_summary(p_business_id, v_start_date, v_end_date);

    v_finance_context := jsonb_build_object(
      'availability', 'AVAILABLE',
      'facts', jsonb_build_object(
        'recordedSales', v_finance.recorded_sales::text,
        'saleCount', v_finance.sale_count,
        'saleItemCount', v_finance.sale_item_count,
        'costedSaleItemCount', v_finance.costed_sale_item_count,
        'missingCostSaleItemCount', v_finance.missing_cost_sale_item_count,
        'costCoverageComplete', v_finance.cost_coverage_complete,
        'estimatedProductCost', v_finance.estimated_product_cost::text,
        'estimatedGrossProfit', v_finance.estimated_gross_profit::text,
        'estimatedGrossMargin', v_finance.estimated_gross_margin::text,
        'operatingExpenses', v_finance.operating_expenses::text,
        'estimatedNetProfit', v_finance.estimated_net_profit::text,
        'estimatedNetMargin', v_finance.estimated_net_margin::text
      )
    );
    if not v_finance.cost_coverage_complete then
      v_limitations := v_limitations || jsonb_build_array(jsonb_build_object(
        'code', 'FINANCE_COST_COVERAGE_INCOMPLETE', 'context', 'finance'
      ));
    end if;
  else
    v_finance_context := jsonb_build_object(
      'availability', 'MODULE_DISABLED',
      'facts', null
    );
    v_limitations := v_limitations || jsonb_build_array(jsonb_build_object(
      'code', 'FINANCE_MODULE_DISABLED', 'context', 'finance'
    ));
  end if;

  if v_smart_insights_enabled then
    -- The existing Smart Inventory RPC remains authoritative. Its first page is
    -- deliberately bounded to fifteen stable name-ordered active products; no
    -- browser or future model can expand this into an unbounded catalog read.
    v_smart_inventory_context := public.get_smart_inventory_snapshot(
      p_business_id, 1, 15
    );
    v_smart_inventory_context := jsonb_build_object(
      'availability', 'AVAILABLE',
      'window', v_smart_inventory_context -> 'window',
      'selection', jsonb_build_object(
        'limit', 15,
        'ordering', 'PRODUCT_NAME',
        'totalActiveProducts', (v_smart_inventory_context -> 'pagination' ->> 'total_items')::bigint,
        'truncated', (v_smart_inventory_context -> 'pagination' ->> 'total_items')::bigint > 15
      ),
      'products', coalesce((
        select jsonb_agg(
          (product - 'product_id')
          order by lower(product ->> 'product_name'), product ->> 'product_name'
        )
        from jsonb_array_elements(v_smart_inventory_context -> 'products') as product
      ), '[]'::jsonb)
    );
  else
    v_smart_inventory_context := jsonb_build_object(
      'availability', 'MODULE_DISABLED',
      'window', null,
      'selection', jsonb_build_object('limit', 15, 'ordering', 'PRODUCT_NAME'),
      'products', '[]'::jsonb
    );
    v_limitations := v_limitations || jsonb_build_array(jsonb_build_object(
      'code', 'SMART_INVENTORY_MODULE_DISABLED', 'context', 'smartInventory'
    ));
  end if;

  if not v_sales_enabled then
    v_limitations := v_limitations || jsonb_build_array(jsonb_build_object(
      'code', 'SALES_MODULE_DISABLED', 'context', 'sales'
    ));
  end if;
  if not v_purchasing_enabled then
    v_limitations := v_limitations || jsonb_build_array(jsonb_build_object(
      'code', 'PURCHASING_MODULE_DISABLED', 'context', 'purchasing'
    ));
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'period', jsonb_build_object(
      'key', p_period,
      'startDate', v_start_date,
      'endDate', v_end_date,
      'asOfBusinessDate', v_today,
      'timezone', v_timezone,
      'currentPartialDateExcluded', p_period = 'LAST_30_COMPLETED_DAYS'
    ),
    'business', jsonb_build_object(
      'currency', v_currency,
      'timezone', v_timezone
    ),
    'modules', jsonb_build_object(
      'inventory', jsonb_build_object('availability', 'AVAILABLE'),
      'sales', jsonb_build_object(
        'availability', case when v_sales_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end
      ),
      'purchasing', jsonb_build_object(
        'availability', case when v_purchasing_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end
      ),
      'finance', jsonb_build_object(
        'availability', case when v_expenses_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end
      ),
      'smartInventory', jsonb_build_object(
        'availability', case when v_smart_insights_enabled then 'AVAILABLE' else 'MODULE_DISABLED' end
      )
    ),
    'inventory', jsonb_build_object(
      'availability', 'AVAILABLE',
      'currentState', v_overview -> 'inventory',
      'attention', jsonb_build_object(
        'limit', 20,
        'totalProducts', v_inventory_attention_count,
        'truncated', v_inventory_attention_count > 20,
        'ordering', 'OUT_OF_STOCK_THEN_LOW_STOCK',
        'products', v_inventory_attention
      )
    ),
    'sales', case when v_sales_enabled then jsonb_build_object(
      'availability', 'AVAILABLE',
      'facts', (v_overview -> 'sales')
        - 'enabled'
        || jsonb_build_object(
          'top_products_by_units_sold', coalesce((
            select jsonb_agg(product - 'product_id' order by ordinal)
            from jsonb_array_elements(v_overview -> 'sales' -> 'top_products_by_units_sold')
              with ordinality as products(product, ordinal)
          ), '[]'::jsonb)
        ),
      'bounds', jsonb_build_object('topProductsLimit', 5, 'trendPointLimit', 31)
    ) else jsonb_build_object('availability', 'MODULE_DISABLED', 'facts', null) end,
    'purchasing', case when v_purchasing_enabled then jsonb_build_object(
      'availability', 'AVAILABLE',
      'facts', (v_overview -> 'purchasing') - 'enabled' - 'available'
    ) else jsonb_build_object('availability', 'MODULE_DISABLED', 'facts', null) end,
    'finance', v_finance_context,
    'smartInventory', v_smart_inventory_context,
    'limitations', v_limitations
  );
end;
$$;

revoke all on function public.get_ai_analyst_context(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_ai_analyst_context(uuid, text)
  to authenticated;

comment on function public.get_ai_analyst_context(uuid, text) is
  'Owner/manager-only deterministic AI Analyst context. Requires enabled AI Analyst, applies business-local bounded periods, preserves exact decimal strings, and excludes customer, supplier-contact, notes, descriptions, and raw cost-bearing rows.';
