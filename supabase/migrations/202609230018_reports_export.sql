-- StockPilot Phase 14: bounded operational reports.

create function public.get_report(
  p_business_id uuid,
  p_report_type text,
  p_start_date date,
  p_end_date date,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.business_role;
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
  v_today date;
  v_total bigint;
  v_summary jsonb;
  v_rows jsonb;
  v_financial record;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;
  if p_report_type not in ('inventory', 'inventory_movements', 'sales', 'purchasing', 'expenses') then
    raise exception 'Unsupported report type' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or p_end_date - p_start_date > 365 or p_page is null or p_page < 1
     or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'A valid date range of at most 366 calendar days and a bounded page are required'
      using errcode = '22023';
  end if;

  v_role := private.active_business_role(p_business_id);
  if v_role is null then raise exception 'Business is unavailable' using errcode = '42501'; end if;
  select business.timezone into v_timezone from public.businesses as business where business.id = p_business_id;
  v_today := (statement_timestamp() at time zone v_timezone)::date;
  if p_end_date > v_today then raise exception 'Report dates cannot be in the future' using errcode = '22023'; end if;
  v_start := p_start_date::timestamp at time zone v_timezone;
  v_end := (p_end_date + 1)::timestamp at time zone v_timezone;

  if p_report_type in ('sales', 'purchasing') and v_role not in ('owner', 'manager', 'employee') then
    raise exception 'This report is not available for your role' using errcode = '42501';
  end if;
  if p_report_type = 'sales' and not exists (select 1 from public.business_modules where business_id = p_business_id and module = 'sales' and enabled) then
    raise exception 'Sales is not enabled for this business' using errcode = '42501';
  end if;
  if p_report_type = 'purchasing' and not exists (select 1 from public.business_modules where business_id = p_business_id and module = 'purchasing' and enabled) then
    raise exception 'Purchasing is not enabled for this business' using errcode = '42501';
  end if;
  if p_report_type = 'expenses' and not private.has_finance_access(p_business_id) then
    raise exception 'Finance access is required' using errcode = '42501';
  end if;

  if p_report_type = 'inventory' then
    select count(*) into v_total from public.products where business_id = p_business_id and is_active;
    select jsonb_build_object(
      'activeProducts', count(*)::bigint,
      'lowStockProducts', count(*) filter (where current_quantity > 0 and low_stock_threshold > 0 and current_quantity <= low_stock_threshold)::bigint,
      'outOfStockProducts', count(*) filter (where current_quantity = 0)::bigint,
      'inventoryValue', case when count(*) filter (where cost_source = 'unknown') = 0 then coalesce(sum(current_quantity * cost_price), 0)::numeric(30,4)::text else null end
    ) into v_summary from public.products where business_id = p_business_id and is_active;
    select coalesce(jsonb_agg(jsonb_build_object(
      'product', product.name, 'sku', product.sku, 'category', category.name,
      'currentQuantity', product.current_quantity::text, 'lowStockThreshold', product.low_stock_threshold::text,
      'status', case when product.current_quantity = 0 then 'OUT_OF_STOCK' when product.low_stock_threshold > 0 and product.current_quantity <= product.low_stock_threshold then 'LOW_STOCK' else 'IN_STOCK' end,
      'costPrice', case when product.cost_source = 'unknown' then null else product.cost_price::text end
    ) order by lower(product.name), product.id), '[]'::jsonb) into v_rows
    from (select * from public.products where business_id = p_business_id and is_active order by lower(name), id limit p_page_size offset ((p_page - 1) * p_page_size)) product
    left join public.categories category on category.business_id = p_business_id and category.id = product.category_id;
  elsif p_report_type = 'inventory_movements' then
    select count(*) into v_total from public.inventory_movements where business_id = p_business_id and created_at >= v_start and created_at < v_end;
    select jsonb_build_object('movementCount', v_total, 'netQuantityChange', coalesce(sum(quantity), 0)::numeric(30,3)::text)
      into v_summary from public.inventory_movements where business_id = p_business_id and created_at >= v_start and created_at < v_end;
    select coalesce(jsonb_agg(jsonb_build_object(
      'date', movement.created_at, 'product', product.name, 'sku', product.sku,
      'movementType', movement.movement_type, 'quantityChange', movement.quantity::text,
      'resultingQuantity', movement.quantity_after::text, 'source', movement.source_type
    ) order by movement.created_at desc, movement.id), '[]'::jsonb) into v_rows
    from (select * from public.inventory_movements where business_id = p_business_id and created_at >= v_start and created_at < v_end order by created_at desc, id limit p_page_size offset ((p_page - 1) * p_page_size)) movement
    join public.products product on product.business_id = p_business_id and product.id = movement.product_id;
  elsif p_report_type = 'sales' then
    select count(*) into v_total from public.sales where business_id = p_business_id and sold_at >= v_start and sold_at < v_end;
    select jsonb_build_object('recordedSales', coalesce(sum(total), 0)::numeric(19,4)::text, 'saleCount', count(*)::bigint, 'unitsSold', coalesce((select sum(item.quantity) from public.sales sale join public.sale_items item on item.business_id = p_business_id and item.sale_id = sale.id where sale.business_id = p_business_id and sale.sold_at >= v_start and sale.sold_at < v_end), 0)::numeric(30,3)::text)
      into v_summary from public.sales where business_id = p_business_id and sold_at >= v_start and sold_at < v_end;
    select coalesce(jsonb_agg(jsonb_build_object('date', sale.sold_at, 'reference', sale.sale_reference, 'itemCount', (select count(*) from public.sale_items item where item.business_id = p_business_id and item.sale_id = sale.id), 'recordedTotal', sale.total::text) order by sale.sold_at desc, sale.id), '[]'::jsonb) into v_rows
    from (select * from public.sales where business_id = p_business_id and sold_at >= v_start and sold_at < v_end order by sold_at desc, id limit p_page_size offset ((p_page - 1) * p_page_size)) sale;
  elsif p_report_type = 'purchasing' then
    select count(*) into v_total from public.purchases where business_id = p_business_id and received_at >= v_start and received_at < v_end;
    select jsonb_build_object('recordedPurchasing', coalesce(sum(total), 0)::numeric(19,4)::text, 'purchaseCount', count(*)::bigint, 'unitsReceived', coalesce((select sum(item.quantity) from public.purchases purchase join public.purchase_items item on item.business_id = p_business_id and item.purchase_id = purchase.id where purchase.business_id = p_business_id and purchase.received_at >= v_start and purchase.received_at < v_end), 0)::numeric(30,3)::text)
      into v_summary from public.purchases where business_id = p_business_id and received_at >= v_start and received_at < v_end;
    select coalesce(jsonb_agg(jsonb_build_object('date', purchase.received_at, 'reference', purchase.purchase_reference, 'supplier', purchase.supplier_name, 'itemCount', (select count(*) from public.purchase_items item where item.business_id = p_business_id and item.purchase_id = purchase.id), 'recordedTotal', purchase.total::text) order by purchase.received_at desc, purchase.id), '[]'::jsonb) into v_rows
    from (select * from public.purchases where business_id = p_business_id and received_at >= v_start and received_at < v_end order by received_at desc, id limit p_page_size offset ((p_page - 1) * p_page_size)) purchase;
  else
    select * into v_financial from public.get_financial_summary(p_business_id, p_start_date, p_end_date);
    v_total := v_financial.sale_count + (select count(*) from public.expenses where business_id = p_business_id and expense_date between p_start_date and p_end_date);
    v_summary := jsonb_build_object('recordedSales', v_financial.recorded_sales::text, 'estimatedGrossProfit', case when v_financial.estimated_gross_profit is null then null else v_financial.estimated_gross_profit::text end, 'estimatedNetProfit', case when v_financial.estimated_net_profit is null then null else v_financial.estimated_net_profit::text end, 'operatingExpenses', v_financial.operating_expenses::text, 'costCoverageComplete', v_financial.cost_coverage_complete, 'limitations', jsonb_build_array('Profit figures are estimates, not accounting statements.', 'Estimated cost coverage is based on recorded sale-item cost basis.'));
    select coalesce(jsonb_agg(jsonb_build_object('date', expense.expense_date, 'category', category.name, 'description', expense.description, 'amount', expense.amount::text, 'status', case when expense.voided then 'VOIDED' else 'RECORDED' end) order by expense.expense_date desc, expense.id), '[]'::jsonb) into v_rows
    from (select * from public.expenses where business_id = p_business_id and expense_date between p_start_date and p_end_date order by expense_date desc, id limit p_page_size offset ((p_page - 1) * p_page_size)) expense
    join public.expense_categories category on category.business_id = p_business_id and category.id = expense.category_id;
  end if;

  return jsonb_build_object('schemaVersion', 1, 'businessId', p_business_id, 'reportType', p_report_type, 'startDate', p_start_date, 'endDate', p_end_date, 'timezone', v_timezone, 'page', p_page, 'pageSize', p_page_size, 'totalRows', v_total, 'summary', coalesce(v_summary, '{}'::jsonb), 'rows', coalesce(v_rows, '[]'::jsonb));
end;
$$;

revoke all on function public.get_report(uuid, text, date, date, integer, integer) from public, anon, authenticated;
grant execute on function public.get_report(uuid, text, date, date, integer, integer) to authenticated;

comment on function public.get_report(uuid,text,date,date,integer,integer) is
  'Bounded, business-local operational report contract. Dates are inclusive, exact numeric values are strings, and Finance uses existing estimated-profit semantics.';
