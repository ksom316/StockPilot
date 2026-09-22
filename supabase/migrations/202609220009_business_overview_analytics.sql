-- StockPilot Phase 8A: bounded, descriptive operational dashboard aggregates.
-- Finance remains the responsibility of get_financial_summary.

create function public.get_business_overview(
  p_business_id uuid,
  p_start_date date,
  p_end_date date
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
  v_start timestamptz;
  v_end timestamptz;
  v_sales_enabled boolean;
  v_purchasing_enabled boolean;
  v_purchasing_available boolean;
  v_result jsonb;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;
  if p_business_id is null or p_start_date is null or p_end_date is null
    or p_start_date > p_end_date or p_end_date - p_start_date > 365 then
    raise exception 'A valid date range of at most 366 calendar days is required' using errcode = '22023';
  end if;

  v_role := private.active_business_role(p_business_id);
  if v_role is null then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;

  select business.timezone into v_timezone
  from public.businesses as business where business.id = p_business_id;
  v_start := p_start_date::timestamp at time zone v_timezone;
  v_end := (p_end_date + 1)::timestamp at time zone v_timezone;

  select coalesce(bool_or(module.enabled) filter (where module.module = 'sales'), false),
         coalesce(bool_or(module.enabled) filter (where module.module = 'purchasing'), false)
  into v_sales_enabled, v_purchasing_enabled
  from public.business_modules as module
  where module.business_id = p_business_id;

  v_purchasing_available := v_purchasing_enabled and v_role in ('owner', 'manager', 'employee');

  with inventory as (
    select count(*) filter (where product.is_active)::bigint as active_products,
      count(*) filter (where product.is_active and product.current_quantity = 0)::bigint as out_of_stock_products,
      count(*) filter (where product.is_active and product.current_quantity > 0
        and product.current_quantity <= product.low_stock_threshold)::bigint as low_stock_products
    from public.products as product
    where product.business_id = p_business_id
  )
  select jsonb_build_object(
    'business_id', p_business_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'timezone', v_timezone,
    'inventory', jsonb_build_object(
      'active_products', inventory.active_products,
      'low_stock_products', inventory.low_stock_products,
      'out_of_stock_products', inventory.out_of_stock_products
    ),
    'sales', case when v_sales_enabled then (
      with selected_sales as (
        select sale.id, sale.sold_at, sale.total
        from public.sales as sale
        where sale.business_id = p_business_id and sale.sold_at >= v_start and sale.sold_at < v_end
      ), summary as (
        select coalesce(sum(total), 0)::numeric(19,4) as recorded_sales,
          count(*)::bigint as sale_count,
          case when count(*) = 0 then null::numeric(19,4)
            else round(sum(total) / count(*)::numeric, 4)::numeric(19,4) end as average_recorded_sale,
          coalesce((select sum(item.quantity) from selected_sales as s
            join public.sale_items as item on item.business_id = p_business_id and item.sale_id = s.id), 0)::numeric as units_sold
        from selected_sales
      ), product_totals as (
        select item.product_id,
          (array_agg(item.product_name order by s.sold_at desc, s.id desc))[1] as product_name,
          (array_agg(item.product_sku order by s.sold_at desc, s.id desc))[1] as product_sku,
          sum(item.quantity)::numeric as units_sold,
          sum(item.line_total)::numeric(19,4) as recorded_sales
        from selected_sales as s
        join public.sale_items as item on item.business_id = p_business_id and item.sale_id = s.id
        group by item.product_id
      ), trend_totals as (
        select (s.sold_at at time zone v_timezone)::date as local_date,
          sum(s.total)::numeric(19,4) as recorded_sales, count(*)::bigint as sale_count
        from selected_sales as s group by (s.sold_at at time zone v_timezone)::date
      )
      select jsonb_build_object(
        'enabled', true,
        'recorded_sales', summary.recorded_sales::text,
        'sale_count', summary.sale_count,
        'average_recorded_sale', summary.average_recorded_sale::text,
        'units_sold', summary.units_sold::text,
        'top_products_by_units_sold', coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_id', top.product_id,
            'product_name', top.product_name,
            'product_sku', top.product_sku,
            'units_sold', top.units_sold::text,
            'recorded_sales', top.recorded_sales::text
          ) order by top.units_sold desc, top.product_name, top.product_id)
          from (select * from product_totals order by units_sold desc, product_name, product_id limit 5) as top
        ), '[]'::jsonb),
        'daily_trend', coalesce((
          select jsonb_agg(jsonb_build_object(
            'date', days.local_date::date,
            'recorded_sales', coalesce(trend.recorded_sales, 0)::numeric(19,4)::text,
            'sale_count', coalesce(trend.sale_count, 0)::bigint
          ) order by days.local_date)
          from generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') as days(local_date)
          left join trend_totals as trend on trend.local_date = days.local_date
        ), '[]'::jsonb)
      ) from summary
    ) else jsonb_build_object('enabled', false) end,
    'purchasing', case when v_purchasing_available then (
      with selected_purchases as (
        select purchase.id, purchase.total from public.purchases as purchase
        where purchase.business_id = p_business_id and purchase.received_at >= v_start and purchase.received_at < v_end
      ), summary as (
        select coalesce(sum(total), 0)::numeric(19,4) as purchase_receipts,
          count(*)::bigint as receipt_count,
          coalesce((select sum(item.quantity) from selected_purchases as p
            join public.purchase_items as item on item.business_id = p_business_id and item.purchase_id = p.id), 0)::numeric as quantity_received
        from selected_purchases
      )
      select jsonb_build_object(
        'enabled', true,
        'available', true,
        'receipt_count', summary.receipt_count,
        'purchase_receipts', summary.purchase_receipts::text,
        'quantity_received', summary.quantity_received::text
      ) from summary
    ) else jsonb_build_object(
      'enabled', v_purchasing_enabled,
      'available', false
    ) end
  ) into v_result
  from inventory;

  return v_result;
end;
$$;

revoke all on function public.get_business_overview(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_business_overview(uuid, date, date) to authenticated;

comment on function public.get_business_overview(uuid,date,date) is
  'Business-scoped descriptive overview for Inventory, Sales, and authorized Purchasing. Dates are inclusive business-local days; exact numeric values are returned as decimal strings. Finance remains in get_financial_summary.';
