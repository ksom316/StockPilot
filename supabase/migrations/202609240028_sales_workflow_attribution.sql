-- StockPilot Phase 15: Sales workflow attribution and fulfillment metadata.

alter table public.sales
  add column sales_channel text not null default 'walk_in',
  add column payment_method text not null default 'cash',
  add column recorded_by_name_snapshot text,
  add column recorded_by_role_snapshot public.business_role,
  add constraint sales_channel_check check (sales_channel in ('walk_in', 'pickup', 'delivery', 'other')),
  add constraint payment_method_check check (payment_method in ('cash', 'mobile_money', 'card', 'bank_transfer')),
  add constraint sales_recorded_by_name_snapshot_check check (
    recorded_by_name_snapshot is null
    or (recorded_by_name_snapshot = btrim(recorded_by_name_snapshot) and length(recorded_by_name_snapshot) between 1 and 120)
  );

update public.sales as sale
set recorded_by_name_snapshot = profile.display_name,
    recorded_by_role_snapshot = member.role
from public.business_members as member
join public.profiles as profile on profile.id = member.user_id
where member.business_id = sale.business_id
  and member.user_id = sale.created_by;

drop function public.record_sale(jsonb, text, uuid);

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

  if p_sales_channel is null or p_sales_channel not in ('walk_in', 'pickup', 'delivery', 'other') then
    raise exception 'Sales channel is invalid' using errcode = '22023';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'mobile_money', 'card', 'bank_transfer') then
    raise exception 'Payment method is invalid' using errcode = '22023';
  end if;

  select profile.display_name, member.role
  into v_recorder_name, v_recorder_role
  from public.business_members as member
  join public.profiles as profile on profile.id = member.user_id
  where member.business_id = v_business_id
    and member.user_id = v_actor_user_id
    and member.status = 'active';
  if v_recorder_name is null or v_recorder_role is null then
    raise exception 'The sale recorder is not an active member of this business' using errcode = '42501';
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
    customer_id, customer_name_snapshot, sales_channel, payment_method,
    recorded_by_name_snapshot, recorded_by_role_snapshot
  ) values (
    v_business_id, v_sale_number, v_subtotal, v_subtotal, nullif(btrim(p_notes), ''),
    v_actor_user_id, p_customer_id, v_customer_name, p_sales_channel, p_payment_method,
    v_recorder_name, v_recorder_role
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
revoke all on function public.record_sale(jsonb, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_sale(jsonb, text, uuid, text, text) to authenticated;

comment on column public.sales.sales_channel is 'How the sale was fulfilled or conducted: walk-in, pickup, delivery, or other.';
comment on column public.sales.payment_method is 'Payment method recorded separately from sales channel.';
comment on column public.sales.recorded_by_name_snapshot is 'Recorder display name captured at sale time.';
comment on column public.sales.recorded_by_role_snapshot is 'Business-scoped recorder role captured at sale time.';
comment on function public.record_sale(jsonb, text, uuid, text, text) is 'Atomic Sales boundary with optional customer, required fulfillment channel, payment method, and business-scoped recorder snapshots.';

