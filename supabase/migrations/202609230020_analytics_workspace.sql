-- Phase 14A: bounded, business-local analytics trends. Existing overview and
-- finance RPCs remain the canonical summary calculations.
create function public.get_analytics_workspace(
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
  v_analytics_enabled boolean;
  v_sales_enabled boolean;
  v_purchasing_enabled boolean;
  v_purchasing_available boolean;
  v_finance_enabled boolean;
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
  select business.timezone into v_timezone from public.businesses as business where business.id = p_business_id;
  select
    coalesce(bool_or(module.enabled) filter (where module.module = 'analytics'), false),
    coalesce(bool_or(module.enabled) filter (where module.module = 'sales'), false),
    coalesce(bool_or(module.enabled) filter (where module.module = 'purchasing'), false)
  into v_analytics_enabled, v_sales_enabled, v_purchasing_enabled
  from public.business_modules as module where module.business_id = p_business_id;
  if not v_analytics_enabled then
    raise exception 'Analytics is not enabled for this business' using errcode = '42501';
  end if;
  v_purchasing_available := v_purchasing_enabled and v_role in ('owner', 'manager', 'employee');
  v_finance_enabled := private.has_finance_access(p_business_id);
  v_start := p_start_date::timestamp at time zone v_timezone;
  v_end := (p_end_date + 1)::timestamp at time zone v_timezone;

  with days as (
    select generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day')::date as local_date
  ), selected_sales as (
    select sale.id, sale.sold_at, sale.total from public.sales as sale
    where v_sales_enabled and sale.business_id = p_business_id and sale.sold_at >= v_start and sale.sold_at < v_end
  ), sales_by_day as (
    select (sale.sold_at at time zone v_timezone)::date as local_date, sum(sale.total)::numeric(19,4) as recorded_sales, count(*)::bigint as sale_count
    from selected_sales as sale group by 1
  ), product_totals as (
    select item.product_id,
      (array_agg(item.product_name order by sale.sold_at desc, sale.id desc))[1] as product_name,
      (array_agg(item.product_sku order by sale.sold_at desc, sale.id desc))[1] as product_sku,
      sum(item.quantity)::numeric as units_sold, sum(item.line_total)::numeric(19,4) as recorded_sales
    from selected_sales as sale join public.sale_items as item on item.business_id = p_business_id and item.sale_id = sale.id
    group by item.product_id
  ), selected_purchases as (
    select purchase.id, purchase.received_at, purchase.total from public.purchases as purchase
    where v_purchasing_available and purchase.business_id = p_business_id and purchase.received_at >= v_start and purchase.received_at < v_end
  ), purchases_by_day as (
    select (purchase.received_at at time zone v_timezone)::date as local_date, sum(purchase.total)::numeric(19,4) as purchase_receipts, count(*)::bigint as receipt_count
    from selected_purchases as purchase group by 1
  ), selected_expenses as (
    select expense.expense_date, sum(expense.amount)::numeric(19,4) as operating_expenses
    from public.expenses as expense
    where v_finance_enabled and expense.business_id = p_business_id and not expense.voided and expense.expense_date between p_start_date and p_end_date
    group by expense.expense_date
  ), financial_by_day as (
    select (sale.sold_at at time zone v_timezone)::date as local_date,
      count(item.id)::bigint as sale_item_count,
      count(item.id) filter (where item.estimated_unit_cost_basis is null)::bigint as missing_cost_count,
      coalesce(sum(item.line_total - (item.quantity * item.estimated_unit_cost_basis)) filter (where item.estimated_unit_cost_basis is not null), 0)::numeric(19,4) as gross_profit
    from selected_sales as sale join public.sale_items as item on item.business_id = p_business_id and item.sale_id = sale.id
    where v_finance_enabled group by 1
  )
  select jsonb_build_object(
    'business_id', p_business_id, 'start_date', p_start_date, 'end_date', p_end_date, 'timezone', v_timezone,
    'sales', case when v_sales_enabled then jsonb_build_object(
      'enabled', true,
      'daily_trend', coalesce((select jsonb_agg(jsonb_build_object('date', days.local_date, 'recorded_sales', coalesce(sales.recorded_sales, 0)::numeric(19,4)::text, 'sale_count', coalesce(sales.sale_count, 0)::bigint) order by days.local_date) from days left join sales_by_day as sales on sales.local_date = days.local_date), '[]'::jsonb),
      'top_products_by_revenue', coalesce((select jsonb_agg(jsonb_build_object('product_id', product.product_id, 'product_name', product.product_name, 'product_sku', product.product_sku, 'units_sold', product.units_sold::text, 'recorded_sales', product.recorded_sales::text) order by product.recorded_sales desc, product.product_name, product.product_id) from (select * from product_totals order by recorded_sales desc, product_name, product_id limit 10) as product), '[]'::jsonb),
      'top_products_by_units', coalesce((select jsonb_agg(jsonb_build_object('product_id', product.product_id, 'product_name', product.product_name, 'product_sku', product.product_sku, 'units_sold', product.units_sold::text, 'recorded_sales', product.recorded_sales::text) order by product.units_sold desc, product.product_name, product.product_id) from (select * from product_totals order by units_sold desc, product_name, product_id limit 10) as product), '[]'::jsonb)
    ) else jsonb_build_object('enabled', false, 'daily_trend', '[]'::jsonb, 'top_products_by_revenue', '[]'::jsonb, 'top_products_by_units', '[]'::jsonb) end,
    'purchasing', jsonb_build_object('enabled', v_purchasing_enabled, 'available', v_purchasing_available, 'daily_trend', case when v_purchasing_available then coalesce((select jsonb_agg(jsonb_build_object('date', days.local_date, 'purchase_receipts', coalesce(purchases.purchase_receipts, 0)::numeric(19,4)::text, 'receipt_count', coalesce(purchases.receipt_count, 0)::bigint) order by days.local_date) from days left join purchases_by_day as purchases on purchases.local_date = days.local_date), '[]'::jsonb) else '[]'::jsonb end),
    'finance', jsonb_build_object('enabled', v_finance_enabled, 'daily_trend', case when v_finance_enabled then coalesce((select jsonb_agg(jsonb_build_object('date', days.local_date, 'estimated_gross_profit', case when coalesce(financial.sale_item_count, 0) = 0 or coalesce(financial.missing_cost_count, 0) > 0 then null else financial.gross_profit::text end, 'operating_expenses', coalesce(expenses.operating_expenses, 0)::numeric(19,4)::text, 'estimated_net_profit', case when coalesce(financial.sale_item_count, 0) = 0 or coalesce(financial.missing_cost_count, 0) > 0 then null else (financial.gross_profit - coalesce(expenses.operating_expenses, 0))::numeric(19,4)::text end, 'cost_coverage_complete', coalesce(financial.sale_item_count, 0) = 0 or coalesce(financial.missing_cost_count, 0) = 0) order by days.local_date) from days left join financial_by_day as financial on financial.local_date = days.local_date left join selected_expenses as expenses on expenses.expense_date = days.local_date), '[]'::jsonb) else '[]'::jsonb end)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_analytics_workspace(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_analytics_workspace(uuid, date, date) to authenticated;

comment on function public.get_analytics_workspace(uuid, date, date) is
  'Bounded business-local Analytics trends for enabled Sales, Purchasing, and authorized Finance modules. Exact numeric values are returned as decimal strings.';
