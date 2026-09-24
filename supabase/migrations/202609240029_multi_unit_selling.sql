-- StockPilot Phase 15A: configurable multi-unit selling on one inventory pool.

create table public.product_selling_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  unit text not null check (unit = btrim(unit) and length(unit) between 1 and 40),
  conversion_quantity numeric(18, 3) not null check (conversion_quantity > 0 and conversion_quantity = round(conversion_quantity, 3)),
  selling_price numeric(19, 4) not null check (selling_price >= 0 and selling_price = round(selling_price, 4)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_selling_units_product_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id)
    on delete cascade,
  constraint product_selling_units_business_id_id_key unique (business_id, id)
);

create unique index product_selling_units_product_unit_unique_idx
  on public.product_selling_units (business_id, product_id, lower(unit));

create index product_selling_units_product_idx
  on public.product_selling_units (business_id, product_id);

create trigger product_selling_units_set_updated_at
before update on public.product_selling_units
for each row execute function private.set_updated_at();

alter table public.product_selling_units enable row level security;
revoke all on table public.product_selling_units from public, anon, authenticated;
grant select on table public.product_selling_units to authenticated;

create policy product_selling_units_select_active_member
on public.product_selling_units
for select
to authenticated
using ((select private.is_active_business_member(business_id)));

create function public.save_product_selling_units(p_product_id uuid, p_units jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_base_unit text;
  v_role public.business_role;
  v_unit jsonb;
  v_unit_name text;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated'
    or p_units is null or jsonb_typeof(p_units) <> 'array'
    or jsonb_array_length(p_units) > 20 then
    raise exception 'Selling unit configuration is invalid' using errcode = '22023';
  end if;

  select product.business_id, product.base_unit
  into v_business_id, v_base_unit
  from public.products as product
  where product.id = p_product_id;
  v_role := private.active_business_role(v_business_id);
  if v_business_id is null or v_role not in ('owner', 'manager', 'employee') then
    raise exception 'Product is not accessible' using errcode = '42501';
  end if;

  delete from public.product_selling_units where business_id = v_business_id and product_id = p_product_id;

  for v_unit in select value from jsonb_array_elements(p_units)
  loop
    v_unit_name := btrim(v_unit ->> 'unit');
    if v_unit_name is null or length(v_unit_name) not between 1 and 40
      or lower(v_unit_name) = lower(v_base_unit)
      or (v_unit ->> 'conversion_quantity')::numeric <= 0
      or (v_unit ->> 'conversion_quantity')::numeric <> round((v_unit ->> 'conversion_quantity')::numeric, 3)
      or (v_unit ->> 'selling_price')::numeric < 0
      or (v_unit ->> 'selling_price')::numeric <> round((v_unit ->> 'selling_price')::numeric, 4)
      or exists (
        select 1 from public.product_selling_units as configured
        where configured.business_id = v_business_id and configured.product_id = p_product_id
          and lower(configured.unit) = lower(v_unit_name)
      ) then
      raise exception 'Selling unit configuration is invalid' using errcode = '22023';
    end if;
    insert into public.product_selling_units (business_id, product_id, unit, conversion_quantity, selling_price)
    values (v_business_id, p_product_id, v_unit_name, (v_unit ->> 'conversion_quantity')::numeric, (v_unit ->> 'selling_price')::numeric);
  end loop;
end;
$$;

revoke all on function public.save_product_selling_units(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_product_selling_units(uuid, jsonb) to authenticated;

alter table public.sale_items
  add column selling_unit text,
  add column selling_conversion_quantity numeric(18, 3),
  add column inventory_quantity numeric(18, 3);

update public.sale_items as item
set selling_unit = product.base_unit,
    selling_conversion_quantity = 1,
    inventory_quantity = item.quantity
from public.products as product
where product.business_id = item.business_id and product.id = item.product_id;

create function private.populate_sale_item_unit_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.selling_unit is null then
    select product.base_unit into new.selling_unit
    from public.products as product
    where product.business_id = new.business_id and product.id = new.product_id;
  end if;
  new.selling_unit := coalesce(new.selling_unit, 'unit');
  new.selling_conversion_quantity := coalesce(new.selling_conversion_quantity, 1);
  new.inventory_quantity := coalesce(new.inventory_quantity, new.quantity * new.selling_conversion_quantity);
  return new;
end;
$$;

create trigger sale_items_populate_unit_snapshot
before insert on public.sale_items
for each row execute function private.populate_sale_item_unit_snapshot();

create function private.populate_purchase_item_conversion_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.inventory_quantity := coalesce(new.inventory_quantity, new.quantity * new.purchase_conversion_quantity);
  new.base_unit_cost := coalesce(new.base_unit_cost, round(new.unit_cost / new.purchase_conversion_quantity, 4));
  return new;
end;
$$;

create trigger purchase_items_populate_conversion_snapshot
before insert on public.purchase_items
for each row execute function private.populate_purchase_item_conversion_snapshot();

alter table public.sale_items
  alter column selling_unit set not null,
  alter column selling_conversion_quantity set not null,
  alter column inventory_quantity set not null,
  add constraint sale_items_selling_unit_check check (selling_unit = btrim(selling_unit) and length(selling_unit) between 1 and 40),
  add constraint sale_items_selling_conversion_check check (selling_conversion_quantity > 0 and selling_conversion_quantity = round(selling_conversion_quantity, 3)),
  add constraint sale_items_inventory_quantity_check check (inventory_quantity > 0 and inventory_quantity = round(inventory_quantity, 3));

drop function public.record_sale(jsonb, text, uuid, text, text);

create function public.record_sale(
  p_items jsonb,
  p_notes text default null,
  p_customer_id uuid default null,
  p_sales_channel text default 'walk_in',
  p_payment_method text default 'cash'
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_business_id uuid;
  v_first_product_id uuid;
  v_item_count integer;
  v_sale_number bigint;
  v_subtotal numeric(19, 4);
  v_sale public.sales%rowtype;
  v_item record;
  v_customer_name text;
  v_recorder_name text;
  v_recorder_role public.business_role;
begin
  if v_actor_user_id is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required to record a sale' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Sale items must be a JSON array' using errcode = '22023';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 200 then
    raise exception 'A sale must contain between 1 and 200 items' using errcode = '22023';
  end if;
  begin
    select (item ->> 'product_id')::uuid into v_first_product_id from jsonb_array_elements(p_items) as item limit 1;
  exception when invalid_text_representation then
    raise exception 'Every sale item requires a valid product ID' using errcode = '22023';
  end;
  if v_first_product_id is null then
    raise exception 'Every sale item requires a valid product ID' using errcode = '22023';
  end if;
  select product.business_id into v_business_id from public.products as product where product.id = v_first_product_id;
  if v_business_id is null or not private.is_active_business_member(v_business_id) then
    raise exception 'Product was not found or is not accessible' using errcode = '42501';
  end if;
  if not exists (select 1 from public.business_modules as module where module.business_id = v_business_id and module.module = 'sales' and module.enabled) then
    raise exception 'Sales is not enabled for this business' using errcode = '42501';
  end if;
  if p_sales_channel is null or p_sales_channel not in ('walk_in', 'pickup', 'delivery', 'other') then
    raise exception 'Sales channel is invalid' using errcode = '22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'mobile_money', 'card', 'bank_transfer') then
    raise exception 'Payment method is invalid' using errcode = '22023';
  end if;
  select profile.display_name, member.role into v_recorder_name, v_recorder_role
  from public.business_members as member join public.profiles as profile on profile.id = member.user_id
  where member.business_id = v_business_id and member.user_id = v_actor_user_id and member.status = 'active';
  if v_recorder_name is null or v_recorder_role is null then
    raise exception 'The sale recorder is not an active member of this business' using errcode = '42501';
  end if;
  if p_customer_id is not null then
    if not exists (select 1 from public.business_modules as module where module.business_id = v_business_id and module.module = 'customers' and module.enabled) then
      raise exception 'Customers is not enabled for this business' using errcode = '42501';
    end if;
    select customer.name into v_customer_name from public.customers as customer where customer.business_id = v_business_id and customer.id = p_customer_id and customer.is_active for update;
    if v_customer_name is null then
      raise exception 'Customer was not found, is inactive, or is not accessible' using errcode = '42501';
    end if;
  end if;
  begin
    if exists (select 1 from jsonb_array_elements(p_items) as item where (item ->> 'product_id') is null or (item ->> 'product_id')::uuid is null or (item ->> 'quantity') is null or (item ->> 'unit_price') is null or (item ->> 'quantity')::numeric <= 0 or (item ->> 'quantity')::numeric <> round((item ->> 'quantity')::numeric, 3) or (item ->> 'unit_price')::numeric < 0 or (item ->> 'unit_price')::numeric <> round((item ->> 'unit_price')::numeric, 4)) then
      raise exception 'Sale quantities must be positive with at most three decimals and prices nonnegative with at most four decimals' using errcode = '22023';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Sale quantities and prices must be valid decimals' using errcode = '22023';
  end;
  if exists (select 1 from jsonb_array_elements(p_items) as item group by (item ->> 'product_id')::uuid having count(*) > 1) then
    raise exception 'A product may appear only once in a sale' using errcode = '22023';
  end if;
  if exists (select 1 from public.products as product join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid where product.business_id = v_business_id and nullif(btrim(item ->> 'selling_unit'), '') is not null and lower(btrim(item ->> 'selling_unit')) <> lower(product.base_unit) and not exists (select 1 from public.product_selling_units as configured where configured.business_id = product.business_id and configured.product_id = product.id and lower(configured.unit) = lower(btrim(item ->> 'selling_unit')))) then
    raise exception 'Selling unit is not configured for one or more products' using errcode = '42501';
  end if;
  if exists (select 1 from public.products as product join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid left join public.product_selling_units as configured on configured.business_id = product.business_id and configured.product_id = product.id and lower(configured.unit) = lower(coalesce(nullif(btrim(item ->> 'selling_unit'), ''), product.base_unit)) where product.business_id = v_business_id and ((item ->> 'quantity')::numeric * coalesce(configured.conversion_quantity, 1)) <> round((item ->> 'quantity')::numeric * coalesce(configured.conversion_quantity, 1), 3)) then
    raise exception 'Converted inventory quantity supports at most three decimals' using errcode = '22023';
  end if;
  perform product.id
  /*
  if v_actor_user_id is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required to record a sale' using errcode =…1440 tokens truncated…oduct.id
  */
  from public.products as product
  join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
  where product.business_id = v_business_id
  order by product.id
  for update of product;

  if (
    select count(*) from public.products as product
    join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id and product.is_active
  ) <> v_item_count then
    raise exception 'Every sale product must be active and belong to the current business' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.products as product
    join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
      and product.current_quantity < ((item ->> 'quantity')::numeric * coalesce((select configured.conversion_quantity from public.product_selling_units as configured where configured.business_id = product.business_id and configured.product_id = product.id and lower(configured.unit) = lower(coalesce(nullif(btrim(item ->> 'selling_unit'), ''), product.base_unit))), 1))
  ) then
    raise exception 'Insufficient stock for one or more sale items' using errcode = '23514';
  end if;
  select sum(round((item ->> 'quantity')::numeric * (item ->> 'unit_price')::numeric, 4))::numeric(19, 4)
  into v_subtotal from jsonb_array_elements(p_items) as item;
  if v_subtotal is null or v_subtotal < 0 then
    raise exception 'Sale total is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stockpilot-sale:' || v_business_id::text, 0)
  );
  select coalesce(max(sale.sale_number), 0) + 1 into v_sale_number
  from public.sales as sale where sale.business_id = v_business_id;

  insert into public.sales (
    business_id, sale_number, subtotal, total, notes, created_by,
    customer_id, customer_name_snapshot, sales_channel, payment_method,
    recorded_by_name_snapshot, recorded_by_role_snapshot
  ) values (
    v_business_id, v_sale_number, v_subtotal, v_subtotal, nullif(btrim(p_notes), ''),
    v_actor_user_id, p_customer_id, v_customer_name, p_sales_channel, p_payment_method,
    v_recorder_name, v_recorder_role
  ) returning * into v_sale;

  insert into public.sale_items (
    business_id, sale_id, product_id, product_name, product_sku, quantity,
    unit_price, line_total, selling_unit, selling_conversion_quantity, inventory_quantity,
    estimated_unit_cost_basis, estimated_cost_source, product_category_id, product_category_name
  )
  select v_business_id, v_sale.id, product.id, product.name, product.sku,
    (item ->> 'quantity')::numeric(18, 3),
    (item ->> 'unit_price')::numeric(19, 4),
    round((item ->> 'quantity')::numeric * (item ->> 'unit_price')::numeric, 4)::numeric(19, 4),
    coalesce(configured.unit, product.base_unit),
    coalesce(configured.conversion_quantity, 1)::numeric(18, 3),
    ((item ->> 'quantity')::numeric * coalesce(configured.conversion_quantity, 1))::numeric(18, 3),
    case when product.cost_source = 'unknown' then null else product.cost_price end,
    case when product.cost_source = 'unknown' then null else product.cost_source end,
    product.category_id, category.name
  from public.products as product
  join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
  left join public.categories as category
    on category.id = product.category_id and category.business_id = product.business_id
  left join public.product_selling_units as configured
    on configured.business_id = product.business_id
    and configured.product_id = product.id
    and lower(configured.unit) = lower(coalesce(nullif(btrim(item ->> 'selling_unit'), ''), product.base_unit))
  where product.business_id = v_business_id;

  for v_item in
    select product.id, product.current_quantity,
      ((item ->> 'quantity')::numeric * coalesce(configured.conversion_quantity, 1))::numeric(18, 3) as quantity
    from public.products as product
    join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
    left join public.product_selling_units as configured
      on configured.business_id = product.business_id
      and configured.product_id = product.id
      and lower(configured.unit) = lower(coalesce(nullif(btrim(item ->> 'selling_unit'), ''), product.base_unit))
    where product.business_id = v_business_id order by product.id
  loop
    update public.products set current_quantity = v_item.current_quantity - v_item.quantity
    where id = v_item.id;
    insert into public.inventory_movements (
      business_id, product_id, movement_type, quantity, quantity_before,
      quantity_after, reason, actor_user_id, source_type, source_reference
    ) values (
      v_business_id, v_item.id, 'stock_out', -v_item.quantity,
      v_item.current_quantity, v_item.current_quantity - v_item.quantity,
      'Sale ' || v_sale.sale_reference, v_actor_user_id, 'sales', v_sale.id
    );
  end loop;
  return v_sale;
end;
$$;
revoke all on function public.record_sale(jsonb, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_sale(jsonb, text, uuid, text, text) to authenticated;

comment on table public.product_selling_units is 'Additional selling units for a product. The product base unit remains the implicit default selling option.';
comment on column public.sale_items.selling_unit is 'Selling unit selected for this sale line.';
comment on column public.sale_items.selling_conversion_quantity is 'Base inventory units per selected selling unit at sale time.';
comment on column public.sale_items.inventory_quantity is 'Base inventory quantity deducted for this sale line.';
comment on function public.record_sale(jsonb, text, uuid, text, text) is 'Atomic Sales boundary that validates a configured selling unit, prices in that unit, and deducts converted base inventory.';

-- Reapply downstream sales aggregates to use converted base inventory quantities.
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
          coalesce((select sum(item.inventory_quantity) from selected_sales as s
            join public.sale_items as item on item.business_id = p_business_id and item.sale_id = s.id), 0)::numeric as units_sold
        from selected_sales
      ), product_totals as (
        select item.product_id,
          (array_agg(item.product_name order by s.sold_at desc, s.id desc))[1] as product_name,
          (array_agg(item.product_sku order by s.sold_at desc, s.id desc))[1] as product_sku,
          sum(item.inventory_quantity)::numeric as units_sold,
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
    select jsonb_build_object('recordedSales', coalesce(sum(total), 0)::numeric(19,4)::text, 'saleCount', count(*)::bigint, 'unitsSold', coalesce((select sum(item.inventory_quantity) from public.sales sale join public.sale_items item on item.business_id = p_business_id and item.sale_id = sale.id where sale.business_id = p_business_id and sale.sold_at >= v_start and sale.sold_at < v_end), 0)::numeric(30,3)::text)
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
      coalesce(sum(item.inventory_quantity) filter (
        where sale.sold_at >= v_observation_start and sale.sold_at < v_window_end
      ), 0)::numeric as recent_quantity,
      count(distinct (sale.sold_at at time zone v_timezone)::date) filter (
        where sale.sold_at >= v_observation_start and sale.sold_at < v_window_end
      )::integer as recent_sale_dates,
      coalesce(sum(item.inventory_quantity) filter (
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
      coalesce(sum(round(item.inventory_quantity * item.estimated_unit_cost_basis, 4)) filter (
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

create or replace function public.get_financial_summary(
  p_business_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  recorded_sales numeric(19, 4),
  sale_count bigint,
  sale_item_count bigint,
  costed_sale_item_count bigint,
  missing_cost_sale_item_count bigint,
  cost_coverage_complete boolean,
  estimated_product_cost numeric(19, 4),
  estimated_gross_profit numeric(19, 4),
  estimated_gross_margin numeric,
  operating_expenses numeric(19, 4),
  estimated_net_profit numeric(19, 4),
  estimated_net_margin numeric,
  purchase_receipts numeric(19, 4)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
  v_purchasing_enabled boolean;
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'A valid start and end date are required' using errcode = '22023';
  end if;
  if not private.has_finance_access(p_business_id) then
    raise exception 'Finance access is required' using errcode = '42501';
  end if;
  select business.timezone into v_timezone from public.businesses as business where business.id = p_business_id;
  v_start := p_start_date::timestamp at time zone v_timezone;
  v_end := (p_end_date + 1)::timestamp at time zone v_timezone;
  select exists (select 1 from public.business_modules where business_id = p_business_id and module = 'purchasing' and enabled)
    into v_purchasing_enabled;

  return query
  with selected_sales as (
    select sale.id, sale.total from public.sales as sale
    where sale.business_id = p_business_id and sale.sold_at >= v_start and sale.sold_at < v_end
  ), sale_stats as (
    select coalesce(sum(selected_sales.total), 0)::numeric(19,4) as revenue,
      count(*)::bigint as sales_count from selected_sales
  ), item_stats as (
    select count(item.id)::bigint as item_count,
      count(item.estimated_unit_cost_basis)::bigint as costed_count,
      coalesce(sum(round(item.inventory_quantity * item.estimated_unit_cost_basis, 4))
        filter (where item.estimated_unit_cost_basis is not null), 0)::numeric(19,4) as estimated_cost
    from selected_sales join public.sale_items as item on item.sale_id = selected_sales.id
  ), expense_stats as (
    select coalesce(sum(expense.amount), 0)::numeric(19,4) as total
    from public.expenses as expense where expense.business_id = p_business_id
      and not expense.voided and expense.expense_date between p_start_date and p_end_date
  ), purchase_stats as (
    select case when v_purchasing_enabled then coalesce(sum(purchase.total), 0)::numeric(19,4) else null end as total
    from public.purchases as purchase where purchase.business_id = p_business_id
      and purchase.received_at >= v_start and purchase.received_at < v_end
  )
  select sale_stats.revenue, sale_stats.sales_count, item_stats.item_count,
    item_stats.costed_count, item_stats.item_count - item_stats.costed_count,
    item_stats.item_count = item_stats.costed_count,
    case when item_stats.item_count = item_stats.costed_count then item_stats.estimated_cost else null end,
    case when item_stats.item_count = item_stats.costed_count then sale_stats.revenue - item_stats.estimated_cost else null end,
    case when item_stats.item_count = item_stats.costed_count and sale_stats.revenue > 0
      then round(((sale_stats.revenue - item_stats.estimated_cost) / sale_stats.revenue) * 100, 6) else null end,
    expense_stats.total,
    case when item_stats.item_count = item_stats.costed_count then sale_stats.revenue - item_stats.estimated_cost - expense_stats.total else null end,
    case when item_stats.item_count = item_stats.costed_count and sale_stats.revenue > 0
      then round(((sale_stats.revenue - item_stats.estimated_cost - expense_stats.total) / sale_stats.revenue) * 100, 6) else null end,
    purchase_stats.total
  from sale_stats cross join item_stats cross join expense_stats cross join purchase_stats;
end;
$$;

revoke all on function public.create_expense(uuid, uuid, numeric, date, text, text) from public, anon, authenticated;
revoke all on function public.update_expense(uuid, uuid, numeric, date, text, text) from public, anon, authenticated;
revoke all on function public.void_expense(uuid, text) from public, anon, authenticated;

create or replace function public.get_analytics_workspace(
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
      sum(item.inventory_quantity)::numeric as units_sold, sum(item.line_total)::numeric(19,4) as recorded_sales
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
      coalesce(sum(item.line_total - (item.inventory_quantity * item.estimated_unit_cost_basis)) filter (where item.estimated_unit_cost_basis is not null), 0)::numeric(19,4) as gross_profit
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

create or replace function public.get_smart_inventory_snapshot(
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
      sum(item.inventory_quantity)::numeric as recorded_sales_quantity,
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
