-- Store inventory, selling prices, and estimated costs in a product's base unit
-- while allowing Purchasing to receive and cost stock in a larger purchase unit.

alter table public.products
  add column base_unit text not null default 'unit',
  add column purchase_unit text not null default 'unit',
  add column purchase_conversion_quantity numeric(18, 3) not null default 1,
  add constraint products_base_unit_check check (base_unit = btrim(base_unit) and length(base_unit) between 1 and 40),
  add constraint products_purchase_unit_check check (purchase_unit = btrim(purchase_unit) and length(purchase_unit) between 1 and 40),
  add constraint products_purchase_conversion_quantity_check check (
    purchase_conversion_quantity > 0
    and purchase_conversion_quantity = round(purchase_conversion_quantity, 3)
    and (lower(purchase_unit) <> lower(base_unit) or purchase_conversion_quantity = 1)
  );

grant insert (base_unit, purchase_unit, purchase_conversion_quantity) on table public.products to authenticated;
grant update (base_unit, purchase_unit, purchase_conversion_quantity) on table public.products to authenticated;

alter table public.purchase_items
  add column base_unit text not null default 'unit',
  add column purchase_unit text not null default 'unit',
  add column purchase_conversion_quantity numeric(18, 3) not null default 1,
  add column inventory_quantity numeric(18, 3),
  add column base_unit_cost numeric(19, 4),
  add constraint purchase_items_purchase_conversion_quantity_check check (purchase_conversion_quantity > 0),
  add constraint purchase_items_inventory_quantity_check check (inventory_quantity > 0),
  add constraint purchase_items_base_unit_cost_check check (base_unit_cost >= 0);

update public.purchase_items
set inventory_quantity = quantity,
    base_unit_cost = unit_cost;

alter table public.purchase_items
  alter column inventory_quantity set not null,
  alter column base_unit_cost set not null;

create or replace function private.mark_received_cost_known()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set cost_price = new.base_unit_cost,
      cost_source = 'purchasing'
  where id = new.product_id
    and business_id = new.business_id;
  return new;
end;
$$;

create or replace function public.record_purchase(
  p_items jsonb,
  p_request_id uuid,
  p_supplier_id uuid default null,
  p_notes text default null
)
returns public.purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_first_product_id uuid;
  v_item_count integer;
  v_purchase_number bigint;
  v_subtotal numeric(19, 4);
  v_supplier_name text;
  v_purchase public.purchases%rowtype;
  v_item record;
begin
  if v_actor_user_id is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required to record a purchase' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'A purchase request ID is required' using errcode = '22023'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Purchase items must be a JSON array' using errcode = '22023'; end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 200 then raise exception 'A purchase must contain between 1 and 200 items' using errcode = '22023'; end if;

  begin
    select (item ->> 'product_id')::uuid into v_first_product_id from jsonb_array_elements(p_items) as item limit 1;
  exception when invalid_text_representation then
    raise exception 'Every purchase item requires a valid product ID' using errcode = '22023';
  end;
  if v_first_product_id is null then raise exception 'Every purchase item requires a valid product ID' using errcode = '22023'; end if;

  select product.business_id into v_business_id
  from public.products as product
  where product.id = v_first_product_id
    and private.active_business_role(product.business_id) in ('owner', 'manager', 'employee');
  if v_business_id is null then raise exception 'Product was not found or is not accessible' using errcode = '42501'; end if;
  if not exists (select 1 from public.business_modules as module where module.business_id = v_business_id and module.module = 'purchasing' and module.enabled) then
    raise exception 'Purchasing is not enabled for this business' using errcode = '42501';
  end if;
  if p_notes is not null and length(btrim(p_notes)) not between 1 and 2000 then raise exception 'Purchase notes must be between 1 and 2000 characters' using errcode = '22023'; end if;

  begin
    if exists (
      select 1 from jsonb_array_elements(p_items) as item
      where (item ->> 'product_id') is null or (item ->> 'product_id')::uuid is null
        or (item ->> 'quantity') is null or (item ->> 'unit_cost') is null
        or (item ->> 'quantity')::numeric <= 0
        or (item ->> 'quantity')::numeric <> round((item ->> 'quantity')::numeric, 3)
        or (item ->> 'quantity')::numeric > 999999999999999.999
        or (item ->> 'unit_cost')::numeric < 0
        or (item ->> 'unit_cost')::numeric <> round((item ->> 'unit_cost')::numeric, 4)
        or (item ->> 'unit_cost')::numeric > 999999999999999.9999
        or round((item ->> 'quantity')::numeric * (item ->> 'unit_cost')::numeric, 4) > 999999999999999.9999
    ) then
      raise exception 'Purchase quantities must be positive with at most three decimals and costs nonnegative with at most four decimals' using errcode = '22023';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Purchase quantities and costs must be valid decimals within supported bounds' using errcode = '22023';
  end;

  if exists (select 1 from jsonb_array_elements(p_items) as item group by (item ->> 'product_id')::uuid having count(*) > 1) then
    raise exception 'A product may appear only once in a purchase' using errcode = '22023';
  end if;
  if (select count(*) from public.products as product join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid where product.business_id = v_business_id and product.is_active) <> v_item_count then
    raise exception 'Every purchase product must be active and belong to the current business' using errcode = '42501';
  end if;

  if p_supplier_id is not null then
    select supplier.name into v_supplier_name from public.suppliers as supplier
    where supplier.id = p_supplier_id and supplier.business_id = v_business_id and supplier.is_active;
    if v_supplier_name is null then raise exception 'Supplier was not found, is inactive, or belongs to another business' using errcode = '42501'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stockpilot-purchase-request:' || v_business_id::text || ':' || p_request_id::text, 0));
  select purchase.* into v_purchase from public.purchases as purchase where purchase.business_id = v_business_id and purchase.request_id = p_request_id;
  if found then return v_purchase; end if;

  perform product.id from public.products as product
  join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
  where product.business_id = v_business_id order by product.id for update of product;

  if (select count(*) from public.products as product join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid where product.business_id = v_business_id and product.is_active) <> v_item_count then
    raise exception 'Every purchase product must be active and belong to the current business' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.products as product
    join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
      and ((item ->> 'quantity')::numeric * product.purchase_conversion_quantity) <> round((item ->> 'quantity')::numeric * product.purchase_conversion_quantity, 3)
  ) then raise exception 'Converted inventory quantity supports at most three decimal places' using errcode = '22023'; end if;
  if exists (
    select 1 from public.products as product
    join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
      and product.current_quantity + ((item ->> 'quantity')::numeric * product.purchase_conversion_quantity) > 999999999999999.999
  ) then raise exception 'Purchase quantity would exceed the supported stock balance' using errcode = '22003'; end if;

  select sum(round((item ->> 'quantity')::numeric * (item ->> 'unit_cost')::numeric, 4)) into v_subtotal from jsonb_array_elements(p_items) as item;
  if v_subtotal is null or v_subtotal < 0 or v_subtotal > 999999999999999.9999 then raise exception 'Purchase total exceeds supported bounds' using errcode = '22003'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stockpilot-purchase:' || v_business_id::text, 0));
  select coalesce(max(purchase.purchase_number), 0) + 1 into v_purchase_number from public.purchases as purchase where purchase.business_id = v_business_id;
  insert into public.purchases (business_id, purchase_number, request_id, supplier_id, supplier_name, subtotal, total, notes, created_by)
  values (v_business_id, v_purchase_number, p_request_id, p_supplier_id, v_supplier_name, v_subtotal, v_subtotal, nullif(btrim(p_notes), ''), v_actor_user_id)
  returning * into v_purchase;

  insert into public.purchase_items (
    business_id, purchase_id, product_id, product_name, product_sku, quantity, unit_cost, line_total,
    base_unit, purchase_unit, purchase_conversion_quantity, inventory_quantity, base_unit_cost
  )
  select v_business_id, v_purchase.id, product.id, product.name, product.sku,
    (item ->> 'quantity')::numeric(18, 3), (item ->> 'unit_cost')::numeric(19, 4),
    round((item ->> 'quantity')::numeric * (item ->> 'unit_cost')::numeric, 4)::numeric(19, 4),
    product.base_unit, product.purchase_unit, product.purchase_conversion_quantity,
    ((item ->> 'quantity')::numeric * product.purchase_conversion_quantity)::numeric(18, 3),
    round((item ->> 'unit_cost')::numeric / product.purchase_conversion_quantity, 4)::numeric(19, 4)
  from public.products as product
  join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
  where product.business_id = v_business_id;

  for v_item in
    select product.id, product.current_quantity,
      ((item ->> 'quantity')::numeric * product.purchase_conversion_quantity)::numeric(18, 3) as inventory_quantity
    from public.products as product
    join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id order by product.id
  loop
    update public.products set current_quantity = v_item.current_quantity + v_item.inventory_quantity where id = v_item.id;
    insert into public.inventory_movements (business_id, product_id, movement_type, quantity, quantity_before, quantity_after, reason, actor_user_id, source_type, source_reference)
    values (v_business_id, v_item.id, 'stock_in', v_item.inventory_quantity, v_item.current_quantity, v_item.current_quantity + v_item.inventory_quantity, 'Purchase ' || v_purchase.purchase_reference, v_actor_user_id, 'purchasing', v_purchase.id);
  end loop;
  return v_purchase;
end;
$$;

comment on column public.products.base_unit is 'Unit used for inventory, sales quantities, prices, costs, and low-stock thresholds.';
comment on column public.products.purchase_unit is 'Unit entered when receiving stock through Purchasing.';
comment on column public.products.purchase_conversion_quantity is 'Base units added to inventory for one purchase unit.';
comment on column public.purchase_items.quantity is 'Purchase-unit quantity received.';
comment on column public.purchase_items.unit_cost is 'Cost per purchase unit on the receipt.';
comment on column public.purchase_items.inventory_quantity is 'Converted base-unit quantity added to inventory.';
comment on column public.purchase_items.base_unit_cost is 'Derived cost per base unit, rounded to four decimal places.';
comment on function public.record_purchase(jsonb, uuid, uuid, text) is 'Authenticated atomic Purchasing boundary that snapshots purchase-unit conversion, adds converted base-unit stock, and derives base-unit cost.';
create or replace function public.get_business_overview(
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
          coalesce((select sum(item.inventory_quantity) from selected_purchases as p
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

create or replace function public.get_report(
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
    select jsonb_build_object('recordedPurchasing', coalesce(sum(total), 0)::numeric(19,4)::text, 'purchaseCount', count(*)::bigint, 'unitsReceived', coalesce((select sum(item.inventory_quantity) from public.purchases purchase join public.purchase_items item on item.business_id = p_business_id and item.purchase_id = purchase.id where purchase.business_id = p_business_id and purchase.received_at >= v_start and purchase.received_at < v_end), 0)::numeric(30,3)::text)
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

create or replace function public.get_business_opportunities(
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
      coalesce(sum(item.inventory_quantity) filter (where purchase.id is not null), 0)::numeric as received_quantity,
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

revoke all on function public.get_business_opportunities(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_business_opportunities(uuid, integer) to authenticated;

