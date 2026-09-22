-- StockPilot Phase 4A: immutable sales records and atomic inventory deductions.

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  sale_number bigint not null check (sale_number > 0),
  sale_reference text generated always as (
    'SALE-' || lpad(sale_number::text, 6, '0')
  ) stored,
  sold_at timestamptz not null default now(),
  subtotal numeric(19, 4) not null check (subtotal >= 0),
  total numeric(19, 4) not null check (total >= 0 and total = subtotal),
  notes text check (notes is null or length(btrim(notes)) between 1 and 2000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sales_business_number_key unique (business_id, sale_number),
  constraint sales_business_id_id_key unique (business_id, id)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  product_name text not null check (length(btrim(product_name)) between 1 and 200),
  product_sku text not null check (length(btrim(product_sku)) between 1 and 100),
  quantity numeric(18, 3) not null check (quantity > 0),
  unit_price numeric(19, 4) not null check (unit_price >= 0),
  line_total numeric(19, 4) not null check (
    line_total >= 0
    and line_total = round(quantity * unit_price, 4)
  ),
  created_at timestamptz not null default now(),
  constraint sale_items_sale_same_business_fk
    foreign key (business_id, sale_id)
    references public.sales (business_id, id)
    on delete restrict,
  constraint sale_items_product_same_business_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id)
    on delete restrict,
  constraint sale_items_sale_product_key unique (sale_id, product_id)
);

create index sales_business_sold_at_idx
  on public.sales (business_id, sold_at desc);

create index sale_items_sale_id_idx
  on public.sale_items (sale_id);

create index sale_items_product_id_idx
  on public.sale_items (product_id);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

revoke all on table public.sales from public, anon, authenticated;
revoke all on table public.sale_items from public, anon, authenticated;

grant select on table public.sales to authenticated;
grant select on table public.sale_items to authenticated;

create policy sales_select_active_member
on public.sales
for select
to authenticated
using ((select private.is_active_business_member(business_id)));

create policy sale_items_select_active_member
on public.sale_items
for select
to authenticated
using ((select private.is_active_business_member(business_id)));

create function public.record_sale(
  p_items jsonb,
  p_notes text default null
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
begin
  if v_actor_user_id is null or (select auth.role()) <> 'authenticated' then
    raise exception 'An authenticated user is required to record a sale'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Sale items must be a JSON array'
      using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 200 then
    raise exception 'A sale must contain between 1 and 200 items'
      using errcode = '22023';
  end if;

  begin
    select (item ->> 'product_id')::uuid
    into v_first_product_id
    from jsonb_array_elements(p_items) as item
    limit 1;
  exception when invalid_text_representation then
    raise exception 'Every sale item requires a valid product ID'
      using errcode = '22023';
  end;

  if v_first_product_id is null then
    raise exception 'Every sale item requires a valid product ID'
      using errcode = '22023';
  end if;

  select product.business_id
  into v_business_id
  from public.products as product
  where product.id = v_first_product_id;

  if v_business_id is null
    or not private.is_active_business_member(v_business_id) then
    raise exception 'Product was not found or is not accessible'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.business_modules as module
    where module.business_id = v_business_id
      and module.module = 'sales'
      and module.enabled
  ) then
    raise exception 'Sales is not enabled for this business'
      using errcode = '42501';
  end if;

  begin
    if exists (
      select 1
      from jsonb_array_elements(p_items) as item
      where (item ->> 'product_id') is null
        or (item ->> 'product_id')::uuid is null
        or (item ->> 'quantity') is null
        or (item ->> 'unit_price') is null
        or (item ->> 'quantity')::numeric <= 0
        or (item ->> 'quantity')::numeric <> round((item ->> 'quantity')::numeric, 3)
        or (item ->> 'unit_price')::numeric < 0
        or (item ->> 'unit_price')::numeric <> round((item ->> 'unit_price')::numeric, 4)
    ) then
      raise exception 'Sale quantities must be positive with at most three decimals and prices nonnegative with at most four decimals'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Sale quantities and prices must be valid decimals'
      using errcode = '22023';
  end;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item
    group by (item ->> 'product_id')::uuid
    having count(*) > 1
  ) then
    raise exception 'A product may appear only once in a sale'
      using errcode = '22023';
  end if;

  -- PostgreSQL acquires these row locks in UUID order, avoiding opposite lock
  -- order between concurrent multi-product sales.
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
    raise exception 'Every sale product must be active and belong to the current business'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.products as product
    join jsonb_array_elements(p_items) as item
      on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
      and product.current_quantity < (item ->> 'quantity')::numeric
  ) then
    raise exception 'Insufficient stock for one or more sale items'
      using errcode = '23514';
  end if;

  select sum(round((item ->> 'quantity')::numeric * (item ->> 'unit_price')::numeric, 4))::numeric(19, 4)
  into v_subtotal
  from jsonb_array_elements(p_items) as item;

  if v_subtotal is null or v_subtotal < 0 then
    raise exception 'Sale total is invalid'
      using errcode = '22023';
  end if;

  -- Serialize numbering only within this business. Different businesses can
  -- create sales concurrently and each may legitimately have SALE-000001.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stockpilot-sale:' || v_business_id::text, 0)
  );

  select coalesce(max(sale.sale_number), 0) + 1
  into v_sale_number
  from public.sales as sale
  where sale.business_id = v_business_id;

  insert into public.sales (
    business_id,
    sale_number,
    subtotal,
    total,
    notes,
    created_by
  ) values (
    v_business_id,
    v_sale_number,
    v_subtotal,
    v_subtotal,
    nullif(btrim(p_notes), ''),
    v_actor_user_id
  )
  returning * into v_sale;

  insert into public.sale_items (
    business_id,
    sale_id,
    product_id,
    product_name,
    product_sku,
    quantity,
    unit_price,
    line_total
  )
  select
    v_business_id,
    v_sale.id,
    product.id,
    product.name,
    product.sku,
    (item ->> 'quantity')::numeric(18, 3),
    (item ->> 'unit_price')::numeric(19, 4),
    round((item ->> 'quantity')::numeric * (item ->> 'unit_price')::numeric, 4)::numeric(19, 4)
  from public.products as product
  join jsonb_array_elements(p_items) as item
    on product.id = (item ->> 'product_id')::uuid
  where product.business_id = v_business_id;

  for v_item in
    select
      product.id,
      product.current_quantity,
      (item ->> 'quantity')::numeric(18, 3) as quantity
    from public.products as product
    join jsonb_array_elements(p_items) as item
      on product.id = (item ->> 'product_id')::uuid
    where product.business_id = v_business_id
    order by product.id
  loop
    update public.products
    set current_quantity = v_item.current_quantity - v_item.quantity
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
      'stock_out',
      -v_item.quantity,
      v_item.current_quantity,
      v_item.current_quantity - v_item.quantity,
      'Sale ' || v_sale.sale_reference,
      v_actor_user_id,
      'sales',
      v_sale.id
    );
  end loop;

  return v_sale;
end;
$$;

revoke all on function public.record_sale(jsonb, text) from public, anon, authenticated;
grant execute on function public.record_sale(jsonb, text) to authenticated;

comment on table public.sales is
  'Immutable sale headers. Sale references are sequential within each business.';

comment on table public.sale_items is
  'Immutable sold-product lines with historical name, SKU, and transaction-price snapshots.';

comment on function public.record_sale(jsonb, text) is
  'Authenticated atomic Sales boundary: validates module and membership, locks products deterministically, records immutable sales, deducts stock, and writes Sales ledger movements.';
