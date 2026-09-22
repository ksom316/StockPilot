-- StockPilot Phase 5A: suppliers, immutable purchase receipts, and atomic stock receiving.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (
    name = btrim(name)
    and length(name) between 1 and 160
  ),
  contact_name text check (
    contact_name is null
    or (contact_name = btrim(contact_name) and length(contact_name) between 1 and 120)
  ),
  phone text check (
    phone is null
    or (phone = btrim(phone) and length(phone) between 1 and 50)
  ),
  email text check (
    email is null
    or (email = btrim(email) and length(email) between 1 and 320)
  ),
  notes text check (
    notes is null
    or (notes = btrim(notes) and length(notes) between 1 and 2000)
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_business_id_id_key unique (business_id, id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  purchase_number bigint not null check (purchase_number > 0),
  purchase_reference text generated always as (
    'PUR-' || lpad(purchase_number::text, 6, '0')
  ) stored,
  request_id uuid not null,
  supplier_id uuid,
  supplier_name text check (
    supplier_name is null
    or (supplier_name = btrim(supplier_name) and length(supplier_name) between 1 and 160)
  ),
  received_at timestamptz not null default now(),
  subtotal numeric(19, 4) not null check (subtotal >= 0),
  total numeric(19, 4) not null check (total >= 0 and total = subtotal),
  notes text check (notes is null or length(btrim(notes)) between 1 and 2000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint purchases_supplier_snapshot_check check (
    (supplier_id is null and supplier_name is null)
    or (supplier_id is not null and supplier_name is not null)
  ),
  constraint purchases_business_supplier_fk
    foreign key (business_id, supplier_id)
    references public.suppliers (business_id, id)
    on delete restrict,
  constraint purchases_business_number_key unique (business_id, purchase_number),
  constraint purchases_business_request_key unique (business_id, request_id),
  constraint purchases_business_id_id_key unique (business_id, id)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  purchase_id uuid not null,
  product_id uuid not null,
  product_name text not null check (length(btrim(product_name)) between 1 and 200),
  product_sku text not null check (length(btrim(product_sku)) between 1 and 100),
  quantity numeric(18, 3) not null check (quantity > 0),
  unit_cost numeric(19, 4) not null check (unit_cost >= 0),
  line_total numeric(19, 4) not null check (
    line_total >= 0
    and line_total = round(quantity * unit_cost, 4)
  ),
  created_at timestamptz not null default now(),
  constraint purchase_items_purchase_same_business_fk
    foreign key (business_id, purchase_id)
    references public.purchases (business_id, id)
    on delete restrict,
  constraint purchase_items_product_same_business_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id)
    on delete restrict,
  constraint purchase_items_purchase_product_key unique (purchase_id, product_id)
);

create index suppliers_business_active_name_idx
  on public.suppliers (business_id, is_active, name);

create index purchases_business_received_at_idx
  on public.purchases (business_id, received_at desc);

create index purchases_business_supplier_received_at_idx
  on public.purchases (business_id, supplier_id, received_at desc);

create index purchase_items_purchase_id_idx
  on public.purchase_items (purchase_id);

create index purchase_items_product_id_idx
  on public.purchase_items (product_id);

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function private.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

revoke all on table public.suppliers from public, anon, authenticated;
revoke all on table public.purchases from public, anon, authenticated;
revoke all on table public.purchase_items from public, anon, authenticated;

grant select on table public.suppliers to authenticated;
grant insert (
  business_id,
  name,
  contact_name,
  phone,
  email,
  notes,
  is_active
) on table public.suppliers to authenticated;
grant update (
  name,
  contact_name,
  phone,
  email,
  notes,
  is_active
) on table public.suppliers to authenticated;

grant select on table public.purchases to authenticated;
grant select on table public.purchase_items to authenticated;

create policy suppliers_select_purchasing_staff
on public.suppliers
for select
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
  and exists (
    select 1
    from public.business_modules as module
    where module.business_id = suppliers.business_id
      and module.module = 'purchasing'
      and module.enabled
  )
);

create policy suppliers_insert_purchasing_managers
on public.suppliers
for insert
to authenticated
with check (
  (select private.active_business_role(business_id)) in ('owner', 'manager')
  and exists (
    select 1
    from public.business_modules as module
    where module.business_id = suppliers.business_id
      and module.module = 'purchasing'
      and module.enabled
  )
);

create policy suppliers_update_purchasing_managers
on public.suppliers
for update
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager')
  and exists (
    select 1
    from public.business_modules as module
    where module.business_id = suppliers.business_id
      and module.module = 'purchasing'
      and module.enabled
  )
)
with check (
  (select private.active_business_role(business_id)) in ('owner', 'manager')
  and exists (
    select 1
    from public.business_modules as module
    where module.business_id = suppliers.business_id
      and module.module = 'purchasing'
      and module.enabled
  )
);

create policy purchases_select_purchasing_staff
on public.purchases
for select
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
  and exists (
    select 1
    from public.business_modules as module
    where module.business_id = purchases.business_id
      and module.module = 'purchasing'
      and module.enabled
  )
);

create policy purchase_items_select_purchasing_staff
on public.purchase_items
for select
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
  and exists (
    select 1
    from public.business_modules as module
    where module.business_id = purchase_items.business_id
      and module.module = 'purchasing'
      and module.enabled
  )
);

create function public.record_purchase(
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
    raise exception 'An authenticated user is required to record a purchase'
      using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'A purchase request ID is required'
      using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Purchase items must be a JSON array'
      using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 200 then
    raise exception 'A purchase must contain between 1 and 200 items'
      using errcode = '22023';
  end if;

  begin
    select (item ->> 'product_id')::uuid
    into v_first_product_id
    from jsonb_array_elements(p_items) as item
    limit 1;
  exception when invalid_text_representation then
    raise exception 'Every purchase item requires a valid product ID'
      using errcode = '22023';
  end;

  if v_first_product_id is null then
    raise exception 'Every purchase item requires a valid product ID'
      using errcode = '22023';
  end if;

  select product.business_id
  into v_business_id
  from public.products as product
  where product.id = v_first_product_id
    and private.active_business_role(product.business_id) in ('owner', 'manager', 'employee');

  if v_business_id is null then
    raise exception 'Product was not found or is not accessible'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.business_modules as module
    where module.business_id = v_business_id
      and module.module = 'purchasing'
      and module.enabled
  ) then
    raise exception 'Purchasing is not enabled for this business'
      using errcode = '42501';
  end if;

  if p_notes is not null and length(btrim(p_notes)) not between 1 and 2000 then
    raise exception 'Purchase notes must be between 1 and 2000 characters'
      using errcode = '22023';
  end if;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_items) as item
      where (item ->> 'product_id') is null
        or (item ->> 'product_id')::uuid is null
        or (item ->> 'quantity') is null
        or (item ->> 'unit_cost') is null
        or (item ->> 'quantity')::numeric <= 0
        or (item ->> 'quantity')::numeric <> round((item ->> 'quantity')::numeric, 3)
        or (item ->> 'quantity')::numeric > 999999999999999.999
        or (item ->> 'unit_cost')::numeric < 0
        or (item ->> 'unit_cost')::numeric <> round((item ->> 'unit_cost')::numeric, 4)
        or (item ->> 'unit_cost')::numeric > 999999999999999.9999
        or round((item ->> 'quantity')::numeric * (item ->> 'unit_cost')::numeric, 4) > 999999999999999.9999
    ) then
      raise exception 'Purchase quantities must be positive with at most three decimals and costs nonnegative with at most four decimals'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Purchase quantities and costs must be valid decimals within supported bounds'
      using errcode = '22023';
  end;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    group by (item ->> 'product_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'A product may appear only once in a purchase'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.products as product
    join jsonb_array_elements(p_items) as item
      on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
      and product.is_active
  ) <> v_item_count then
    raise exception 'Every purchase product must be active and belong to the current business'
      using errcode = '42501';
  end if;

  if p_supplier_id is not null then
    select supplier.name
    into v_supplier_name
    from public.suppliers as supplier
    where supplier.id = p_supplier_id
      and supplier.business_id = v_business_id
      and supplier.is_active;

    if v_supplier_name is null then
      raise exception 'Supplier was not found, is inactive, or belongs to another business'
        using errcode = '42501';
    end if;
  end if;

  -- Serialize the same business/request pair before checking the persisted key.
  -- The uniqueness constraint is the final database-level safeguard.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stockpilot-purchase-request:' || v_business_id::text || ':' || p_request_id::text,
      0
    )
  );

  select purchase.*
  into v_purchase
  from public.purchases as purchase
  where purchase.business_id = v_business_id
    and purchase.request_id = p_request_id;

  if found then
    return v_purchase;
  end if;

  -- Lock every product in a stable order shared with record_sale. The second
  -- validation below observes the latest committed product state.
  perform product.id
  from public.products as product
  join jsonb_array_elements(p_items) as item
    on product.id = (item ->> 'product_id')::uuid
  where product.business_id = v_business_id
  order by product.id
  for update of product;

  if (
    select count(*)
    from public.products as product
    join jsonb_array_elements(p_items) as item
      on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
      and product.is_active
  ) <> v_item_count then
    raise exception 'Every purchase product must be active and belong to the current business'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.products as product
    join jsonb_array_elements(p_items) as item
      on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
      and product.current_quantity + (item ->> 'quantity')::numeric > 999999999999999.999
  ) then
    raise exception 'Purchase quantity would exceed the supported stock balance'
      using errcode = '22003';
  end if;

  select sum(
    round((item ->> 'quantity')::numeric * (item ->> 'unit_cost')::numeric, 4)
  )
  into v_subtotal
  from jsonb_array_elements(p_items) as item;

  if v_subtotal is null
    or v_subtotal < 0
    or v_subtotal > 999999999999999.9999 then
    raise exception 'Purchase total exceeds supported bounds'
      using errcode = '22003';
  end if;

  -- Purchase references are sequential only within this business.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stockpilot-purchase:' || v_business_id::text, 0)
  );

  select coalesce(max(purchase.purchase_number), 0) + 1
  into v_purchase_number
  from public.purchases as purchase
  where purchase.business_id = v_business_id;

  insert into public.purchases (
    business_id,
    purchase_number,
    request_id,
    supplier_id,
    supplier_name,
    subtotal,
    total,
    notes,
    created_by
  ) values (
    v_business_id,
    v_purchase_number,
    p_request_id,
    p_supplier_id,
    v_supplier_name,
    v_subtotal,
    v_subtotal,
    nullif(btrim(p_notes), ''),
    v_actor_user_id
  )
  returning * into v_purchase;

  insert into public.purchase_items (
    business_id,
    purchase_id,
    product_id,
    product_name,
    product_sku,
    quantity,
    unit_cost,
    line_total
  )
  select
    v_business_id,
    v_purchase.id,
    product.id,
    product.name,
    product.sku,
    (item ->> 'quantity')::numeric(18, 3),
    (item ->> 'unit_cost')::numeric(19, 4),
    round((item ->> 'quantity')::numeric * (item ->> 'unit_cost')::numeric, 4)::numeric(19, 4)
  from public.products as product
  join jsonb_array_elements(p_items) as item
    on product.id = (item ->> 'product_id')::uuid
  where product.business_id = v_business_id;

  for v_item in
    select
      product.id,
      product.current_quantity,
      (item ->> 'quantity')::numeric(18, 3) as quantity,
      (item ->> 'unit_cost')::numeric(19, 4) as unit_cost
    from public.products as product
    join jsonb_array_elements(p_items) as item
      on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
    order by product.id
  loop
    update public.products
    set
      current_quantity = v_item.current_quantity + v_item.quantity,
      cost_price = v_item.unit_cost
    where id = v_item.id;

    insert into public.inventory_movements (
      business_id,
      product_id,
      movement_type,
      quantity,
      quantity_before,
      quantity_after,
      reason,
      actor_user_id,
      source_type,
      source_reference
    ) values (
      v_business_id,
      v_item.id,
      'stock_in',
      v_item.quantity,
      v_item.current_quantity,
      v_item.current_quantity + v_item.quantity,
      'Purchase ' || v_purchase.purchase_reference,
      v_actor_user_id,
      'purchasing',
      v_purchase.id
    );
  end loop;

  return v_purchase;
end;
$$;

revoke all on function public.record_purchase(jsonb, uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.record_purchase(jsonb, uuid, uuid, text)
to authenticated;

comment on table public.suppliers is
  'Tenant-scoped Purchasing suppliers. Suppliers are optional on completed receipts and are normally deactivated rather than deleted.';

comment on table public.purchases is
  'Immutable completed stock receipts with per-business references and persisted idempotency keys.';

comment on table public.purchase_items is
  'Immutable received-product lines with historical product, SKU, quantity, and transaction-cost snapshots.';

comment on column public.products.cost_price is
  'Latest/default received cost. It is not COGS, weighted-average cost, FIFO/LIFO, or accounting inventory valuation.';

comment on function public.record_purchase(jsonb, uuid, uuid, text) is
  'Authenticated atomic Purchasing boundary: validates role and module access, persists an idempotency key, records immutable receipt snapshots, updates latest cost and stock, and appends linked stock-in movements.';
