-- StockPilot Phase 7A: optional tenant-scoped Customers and atomic Sales linkage.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null check (name = btrim(name) and length(name) between 1 and 160),
  phone text check (phone is null or (phone = btrim(phone) and length(phone) between 1 and 50)),
  email text check (email is null or (email = btrim(email) and length(email) between 1 and 320)),
  note text check (note is null or (note = btrim(note) and length(note) between 1 and 2000)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_business_id_id_key unique (business_id, id)
);

create index customers_business_active_name_idx
  on public.customers (business_id, is_active, name);

create trigger customers_set_updated_at
before update on public.customers
for each row execute function private.set_updated_at();

alter table public.customers enable row level security;

-- The shared Supabase `authenticated` database role cannot express grants by
-- business_members.role. Keep direct reads owner/manager-only, and expose a
-- narrowly scoped basic-field lookup RPC to employee/cashier callers.
revoke all on table public.customers from public, anon, authenticated;
grant select on table public.customers to authenticated;

create policy customers_select_enabled_managers
on public.customers
for select
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager')
  and exists (
    select 1 from public.business_modules as module
    where module.business_id = customers.business_id
      and module.module = 'customers'
      and module.enabled
  )
);

create function public.lookup_customers(p_business_id uuid)
returns table (id uuid, name text, phone text, email text, is_active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.business_role := private.active_business_role(p_business_id);
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated'
    or v_role is null or v_role not in ('owner', 'manager', 'employee', 'cashier') then
    raise exception 'Customer business is not accessible' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_modules
    where business_id = p_business_id and module = 'customers' and enabled
  ) then
    raise exception 'Customers is not enabled for this business' using errcode = '42501';
  end if;
  return query
    select customer.id, customer.name, customer.phone, customer.email, customer.is_active
    from public.customers as customer
    where customer.business_id = p_business_id and customer.is_active
    order by customer.name, customer.id;
end;
$$;

create function public.create_customer(
  p_business_id uuid,
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.business_role := private.active_business_role(p_business_id);
  v_customer_id uuid;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('owner', 'manager', 'employee', 'cashier') then
    raise exception 'Customer business is not accessible' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_modules
    where business_id = p_business_id and module = 'customers' and enabled
  ) then
    raise exception 'Customers is not enabled for this business' using errcode = '42501';
  end if;
  if v_role in ('employee', 'cashier') and p_note is not null then
    raise exception 'Employees and cashiers cannot create customer notes' using errcode = '42501';
  end if;
  insert into public.customers (business_id, name, phone, email, note)
  values (p_business_id, p_name, p_phone, p_email, p_note)
  returning id into v_customer_id;
  return v_customer_id;
end;
$$;

create function public.update_customer(
  p_business_id uuid,
  p_customer_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.business_role := private.active_business_role(p_business_id);
  v_customer_id uuid;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated'
    or v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager may update customers' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_modules
    where business_id = p_business_id and module = 'customers' and enabled
  ) then
    raise exception 'Customers is not enabled for this business' using errcode = '42501';
  end if;
  update public.customers
  set name = p_name, phone = p_phone, email = p_email, note = p_note
  where business_id = p_business_id and id = p_customer_id
  returning id into v_customer_id;
  if v_customer_id is null then
    raise exception 'Customer was not found or is not accessible' using errcode = '42501';
  end if;
  return v_customer_id;
end;
$$;

create function public.set_customer_active(
  p_business_id uuid,
  p_customer_id uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.business_role := private.active_business_role(p_business_id);
  v_customer_id uuid;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated'
    or v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager may change customer status' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_modules
    where business_id = p_business_id and module = 'customers' and enabled
  ) then
    raise exception 'Customers is not enabled for this business' using errcode = '42501';
  end if;
  update public.customers
  set is_active = p_is_active
  where business_id = p_business_id and id = p_customer_id
  returning id into v_customer_id;
  if v_customer_id is null then
    raise exception 'Customer was not found or is not accessible' using errcode = '42501';
  end if;
  return v_customer_id;
end;
$$;

revoke all on function public.create_customer(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.lookup_customers(uuid) from public, anon, authenticated;
revoke all on function public.update_customer(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.set_customer_active(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.create_customer(uuid, text, text, text, text) to authenticated;
grant execute on function public.lookup_customers(uuid) to authenticated;
grant execute on function public.update_customer(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.set_customer_active(uuid, uuid, boolean) to authenticated;

alter table public.sales
  add column customer_id uuid,
  add column customer_name_snapshot text,
  add constraint sales_customer_snapshot_check check (
    (customer_id is null and customer_name_snapshot is null)
    or (customer_id is not null and customer_name_snapshot is not null
      and customer_name_snapshot = btrim(customer_name_snapshot)
      and length(customer_name_snapshot) between 1 and 160)
  ),
  add constraint sales_customer_same_business_fk
    foreign key (business_id, customer_id)
    references public.customers (business_id, id)
    on delete restrict;

create index sales_business_customer_sold_at_idx
  on public.sales (business_id, customer_id, sold_at desc)
  where customer_id is not null;

-- Replace the existing RPC signature with an optional customer argument. The
-- default preserves existing PostgREST callers; NULL remains a normal walk-in.
drop function public.record_sale(jsonb, text);

create function public.record_sale(
  p_items jsonb,
  p_notes text default null,
  p_customer_id uuid default null
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
    select (item ->> 'product_id')::uuid into v_first_product_id
    from jsonb_array_elements(p_items) as item limit 1;
  exception when invalid_text_representation then
    raise exception 'Every sale item requires a valid product ID' using errcode = '22023';
  end;
  if v_first_product_id is null then
    raise exception 'Every sale item requires a valid product ID' using errcode = '22023';
  end if;
  select product.business_id into v_business_id
  from public.products as product where product.id = v_first_product_id;
  if v_business_id is null or not private.is_active_business_member(v_business_id) then
    raise exception 'Product was not found or is not accessible' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_modules as module
    where module.business_id = v_business_id and module.module = 'sales' and module.enabled
  ) then
    raise exception 'Sales is not enabled for this business' using errcode = '42501';
  end if;

  if p_customer_id is not null then
    if not exists (
      select 1 from public.business_modules as module
      where module.business_id = v_business_id and module.module = 'customers' and module.enabled
    ) then
      raise exception 'Customers is not enabled for this business' using errcode = '42501';
    end if;
    -- FOR UPDATE serializes this sale against manager activation changes. If a
    -- sale gets the lock first, it commits as an active-customer sale; if a
    -- deactivation gets it first, this lookup observes inactive and rejects.
    select customer.name into v_customer_name
    from public.customers as customer
    where customer.business_id = v_business_id
      and customer.id = p_customer_id
      and customer.is_active
    for update;
    if v_customer_name is null then
      raise exception 'Customer was not found, is inactive, or is not accessible' using errcode = '42501';
    end if;
  end if;

  begin
    if exists (
      select 1 from jsonb_array_elements(p_items) as item
      where (item ->> 'product_id') is null
        or (item ->> 'product_id')::uuid is null
        or (item ->> 'quantity') is null
        or (item ->> 'unit_price') is null
        or (item ->> 'quantity')::numeric <= 0
        or (item ->> 'quantity')::numeric <> round((item ->> 'quantity')::numeric, 3)
        or (item ->> 'unit_price')::numeric < 0
        or (item ->> 'unit_price')::numeric <> round((item ->> 'unit_price')::numeric, 4)
    ) then
      raise exception 'Sale quantities must be positive with at most three decimals and prices nonnegative with at most four decimals' using errcode = '22023';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Sale quantities and prices must be valid decimals' using errcode = '22023';
  end;
  if exists (
    select 1 from jsonb_array_elements(p_items) as item
    group by (item ->> 'product_id')::uuid having count(*) > 1
  ) then
    raise exception 'A product may appear only once in a sale' using errcode = '22023';
  end if;

  perform product.id
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
      and product.current_quantity < (item ->> 'quantity')::numeric
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
    customer_id, customer_name_snapshot
  ) values (
    v_business_id, v_sale_number, v_subtotal, v_subtotal, nullif(btrim(p_notes), ''),
    v_actor_user_id, p_customer_id, v_customer_name
  ) returning * into v_sale;

  insert into public.sale_items (
    business_id, sale_id, product_id, product_name, product_sku, quantity,
    unit_price, line_total, estimated_unit_cost_basis, estimated_cost_source,
    product_category_id, product_category_name
  )
  select v_business_id, v_sale.id, product.id, product.name, product.sku,
    (item ->> 'quantity')::numeric(18, 3),
    (item ->> 'unit_price')::numeric(19, 4),
    round((item ->> 'quantity')::numeric * (item ->> 'unit_price')::numeric, 4)::numeric(19, 4),
    case when product.cost_source = 'unknown' then null else product.cost_price end,
    case when product.cost_source = 'unknown' then null else product.cost_source end,
    product.category_id, category.name
  from public.products as product
  join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
  left join public.categories as category
    on category.id = product.category_id and category.business_id = product.business_id
  where product.business_id = v_business_id;

  for v_item in
    select product.id, product.current_quantity, (item ->> 'quantity')::numeric(18, 3) as quantity
    from public.products as product
    join jsonb_array_elements(p_items) as item on product.id = (item ->> 'product_id')::uuid
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

revoke all on function public.record_sale(jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.record_sale(jsonb, text, uuid) to authenticated;

comment on table public.customers is
  'Minimal optional customer directory. Customers are deactivated rather than deleted; duplicate contact details are allowed.';
comment on column public.customers.note is
  'Private internal note; customer table RLS restricts direct reads to owners and managers.';
comment on column public.sales.customer_name_snapshot is
  'Immutable sale-time customer name only. Historical Sales does not depend on the live Customers module.';
comment on function public.create_customer(uuid, text, text, text, text) is
  'Creates a customer for an active member; employees/cashiers may create only without a note.';
comment on function public.lookup_customers(uuid) is
  'Returns active basic customer fields to enabled Customers module members; never returns notes or history.';
comment on function public.record_sale(jsonb, text, uuid) is
  'Atomic Sales boundary. A NULL customer is a walk-in; a linked customer is validated and name-snapshotted under a row lock.';
