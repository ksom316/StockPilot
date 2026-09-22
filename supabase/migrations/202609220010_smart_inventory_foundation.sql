-- StockPilot Phase 9A: deterministic Smart Inventory data foundation.
-- This remains operational inventory intelligence; it contains no Finance,
-- prediction, recommendation, or AI semantics.

create function public.get_smart_inventory_snapshot(
  p_business_id uuid,
  p_page integer default 1,
  p_page_size integer default 50
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
  v_as_of_date date;
  v_window_start_date date;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_smart_insights_enabled boolean;
  v_sales_enabled boolean;
  v_sales_observable_from timestamptz;
  v_total_items bigint;
  v_total_pages bigint;
  v_products jsonb;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;

  if p_business_id is null then
    raise exception 'A business is required' using errcode = '22023';
  end if;

  if p_page is null or p_page < 1 or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Page must be at least 1 and page size must be between 1 and 100'
      using errcode = '22023';
  end if;

  v_role := private.active_business_role(p_business_id);
  if v_role is null then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'manager', 'employee') then
    raise exception 'Smart Inventory access is required' using errcode = '42501';
  end if;

  select business.timezone
  into v_timezone
  from public.businesses as business
  where business.id = p_business_id;

  select
    coalesce(bool_or(module.enabled) filter (where module.module = 'smart_insights'), false),
    coalesce(bool_or(module.enabled) filter (where module.module = 'sales'), false),
    max(module.updated_at) filter (where module.module = 'sales')
  into v_smart_insights_enabled, v_sales_enabled, v_sales_observable_from
  from public.business_modules as module
  where module.business_id = p_business_id;

  if not v_smart_insights_enabled then
    raise exception 'Smart Inventory is not enabled for this business' using errcode = '42501';
  end if;

  -- The window contains the 30 most recently completed business-local dates.
  -- Local midnights are converted by PostgreSQL using the validated IANA zone,
  -- so session/browser timezones cannot shift the boundary (including DST).
  v_as_of_date := (statement_timestamp() at time zone v_timezone)::date;
  v_window_start_date := v_as_of_date - 30;
  v_window_start := v_window_start_date::timestamp at time zone v_timezone;
  v_window_end := v_as_of_date::timestamp at time zone v_timezone;

  select count(*)::bigint
  into v_total_items
  from public.products as product
  where product.business_id = p_business_id
    and product.is_active;

  v_total_pages := case
    when v_total_items = 0 then 0
    else ceil(v_total_items::numeric / p_page_size)::bigint
  end;

  with paged_products as materialized (
    select product.id, product.name, product.sku, product.current_quantity,
      product.low_stock_threshold, product.created_at
    from public.products as product
    where product.business_id = p_business_id
      and product.is_active
    order by lower(product.name), product.name, product.id
    limit p_page_size
    offset ((p_page - 1)::bigint * p_page_size)::bigint
  ),
  selected_sales as materialized (
    select sale.id, sale.sold_at
    from public.sales as sale
    where v_sales_enabled
      and sale.business_id = p_business_id
      and sale.sold_at >= v_window_start
      and sale.sold_at < v_window_end
  ),
  sales_by_product as (
    select item.product_id,
      sum(item.quantity)::numeric as recorded_sales_quantity,
      count(distinct (sale.sold_at at time zone v_timezone)::date)::integer as distinct_sale_dates
    from selected_sales as sale
    join public.sale_items as item
      on item.business_id = p_business_id
     and item.sale_id = sale.id
    join paged_products as product on product.id = item.product_id
    group by item.product_id
  ),
  movements_by_product as (
    select movement.product_id,
      count(*)::bigint as movement_count,
      sum(movement.quantity)::numeric as net_movement_quantity
    from public.inventory_movements as movement
    join paged_products as product on product.id = movement.product_id
    where movement.business_id = p_business_id
      and movement.created_at >= v_window_start
      and movement.created_at < v_window_end
    group by movement.product_id
  ),
  facts as (
    select product.*,
      coalesce(sales.recorded_sales_quantity, 0.000::numeric) as recorded_sales_quantity,
      coalesce(sales.distinct_sale_dates, 0)::integer as distinct_sale_dates,
      coalesce(movements.movement_count, 0)::bigint as movement_count,
      coalesce(movements.net_movement_quantity, 0.000::numeric) as net_movement_quantity,
      greatest(
        0,
        least(
          30,
          v_as_of_date - greatest(
            v_window_start_date,
            case
              when (product.created_at at time zone v_timezone)::time = time '00:00:00'
                then (product.created_at at time zone v_timezone)::date
              else (product.created_at at time zone v_timezone)::date + 1
            end
          )
        )
      )::integer as inventory_eligible_days,
      case when v_sales_enabled then greatest(
        0,
        least(
          30,
          v_as_of_date - greatest(
            v_window_start_date,
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
        )
      )::integer else 0 end as sales_eligible_days
    from paged_products as product
    left join sales_by_product as sales on sales.product_id = product.id
    left join movements_by_product as movements on movements.product_id = product.id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', fact.id,
      'product_name', fact.name,
      'product_sku', fact.sku,
      'stock', jsonb_build_object(
        'current_quantity', fact.current_quantity::text,
        'low_stock_threshold', fact.low_stock_threshold::text,
        'state', case
          when fact.current_quantity = 0 then 'OUT_OF_STOCK'
          when fact.current_quantity > 0 and fact.current_quantity <= fact.low_stock_threshold then 'LOW_STOCK'
          else 'IN_STOCK'
        end,
        'reorder_attention', fact.current_quantity = 0
          or (fact.current_quantity > 0 and fact.current_quantity <= fact.low_stock_threshold)
      ),
      'sales_observation', jsonb_build_object(
        'enabled', v_sales_enabled,
        'eligible_days', fact.sales_eligible_days,
        'complete_window', v_sales_enabled and fact.sales_eligible_days = 30,
        'context_code', case
          when not v_sales_enabled then 'SALES_DISABLED'
          when fact.sales_eligible_days < 30 then 'INSUFFICIENT_HISTORY'
          when fact.recorded_sales_quantity = 0 then 'NO_RECORDED_SALES_30D'
          else 'RECORDED_SALES_OBSERVED'
        end,
        'recorded_sales_quantity', case when v_sales_enabled then fact.recorded_sales_quantity::text else null end,
        'distinct_sale_dates', case when v_sales_enabled then fact.distinct_sale_dates else null end,
        'average_recorded_quantity_per_day', case
          when v_sales_enabled and fact.sales_eligible_days = 30 and fact.recorded_sales_quantity > 0
            then (fact.recorded_sales_quantity / 30::numeric)::text
          else null
        end
      ),
      'days_of_stock', jsonb_build_object(
        'status', case
          when v_sales_enabled and fact.sales_eligible_days = 30
            and fact.distinct_sale_dates >= 3 and fact.recorded_sales_quantity > 0
            and fact.current_quantity > 0 then 'ESTIMATE_AVAILABLE'
          else 'DAYS_ESTIMATE_UNAVAILABLE'
        end,
        'unavailable_reason', case
          when not v_sales_enabled then 'SALES_DISABLED'
          when fact.sales_eligible_days < 30 then 'INSUFFICIENT_HISTORY'
          when fact.current_quantity = 0 then 'OUT_OF_STOCK'
          when fact.recorded_sales_quantity = 0 then 'ZERO_RECORDED_SALES'
          when fact.distinct_sale_dates < 3 then 'FEWER_THAN_THREE_SALE_DATES'
          else null
        end,
        -- Multiplying by 30 before division avoids using a rounded daily rate
        -- as the canonical input. PostgreSQL numeric remains authoritative.
        'estimated_days', case
          when v_sales_enabled and fact.sales_eligible_days = 30
            and fact.distinct_sale_dates >= 3 and fact.recorded_sales_quantity > 0
            and fact.current_quantity > 0
            then ((fact.current_quantity * 30::numeric) / fact.recorded_sales_quantity)::text
          else null
        end
      ),
      'inventory_movement_observation', jsonb_build_object(
        'eligible_days', fact.inventory_eligible_days,
        'complete_window', fact.inventory_eligible_days = 30,
        'context_code', case
          when fact.inventory_eligible_days < 30 then 'INSUFFICIENT_HISTORY'
          when fact.movement_count > 0 then 'RECORDED_INVENTORY_MOVEMENTS_OBSERVED'
          when fact.current_quantity > 0 then 'NO_RECORDED_INVENTORY_MOVEMENTS_30D'
          else 'NO_MOVEMENT_ATTENTION_UNAVAILABLE'
        end,
        'movement_count', fact.movement_count,
        'net_movement_quantity', fact.net_movement_quantity::text
      )
    ) order by lower(fact.name), fact.name, fact.id
  ), '[]'::jsonb)
  into v_products
  from facts as fact;

  return jsonb_build_object(
    'business_id', p_business_id,
    'timezone', v_timezone,
    'as_of_date', v_as_of_date,
    'window', jsonb_build_object(
      'start_date', v_window_start_date,
      'end_date_exclusive', v_as_of_date,
      'completed_business_dates', 30
    ),
    'modules', jsonb_build_object(
      'smart_insights_enabled', true,
      'sales_enabled', v_sales_enabled
    ),
    'pagination', jsonb_build_object(
      'page', p_page,
      'page_size', p_page_size,
      'total_items', v_total_items,
      'total_pages', v_total_pages
    ),
    'products', v_products
  );
end;
$$;

revoke all on function public.get_smart_inventory_snapshot(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_smart_inventory_snapshot(uuid, integer, integer)
  to authenticated;

comment on function public.get_smart_inventory_snapshot(uuid, integer, integer) is
  'Paginated deterministic Smart Inventory facts for active products. Uses current stock plus a 30-completed-business-date observation window; exact numerics are decimal strings. Requires active owner/manager/employee membership and enabled Smart Insights.';
