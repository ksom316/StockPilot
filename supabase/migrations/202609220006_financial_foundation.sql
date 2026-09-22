-- StockPilot Phase 6A: estimated sale cost basis, audited expenses, and finance summary.

create type public.product_cost_source as enum ('unknown', 'manual', 'purchasing');
create type public.expense_audit_action as enum ('created', 'updated', 'voided');

alter table public.businesses
  add column timezone text not null default 'UTC';

create function private.validate_business_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'Business timezone must be a valid IANA timezone name'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger businesses_validate_timezone
before insert or update of timezone on public.businesses
for each row execute function private.validate_business_timezone();

grant update (timezone) on table public.businesses to authenticated;

alter table public.products
  add column cost_source public.product_cost_source not null default 'unknown';

-- Existing rows intentionally remain unknown, regardless of their legacy cost_price.
create function private.track_manual_product_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.cost_source := 'manual';
    end if;
  elsif new.cost_price is distinct from old.cost_price
    and new.cost_source = old.cost_source
    and (select auth.uid()) is not null then
    new.cost_source := 'manual';
  end if;
  return new;
end;
$$;

create trigger products_track_manual_cost
before insert or update of cost_price on public.products
for each row execute function private.track_manual_product_cost();

alter table public.sale_items
  add column estimated_unit_cost_basis numeric(19, 4),
  add column estimated_cost_source public.product_cost_source,
  add column product_category_id uuid,
  add column product_category_name text,
  add constraint sale_items_estimated_cost_pair_check check (
    (estimated_unit_cost_basis is null and estimated_cost_source is null)
    or (
      estimated_unit_cost_basis is not null
      and estimated_unit_cost_basis >= 0
      and estimated_cost_source in ('manual', 'purchasing')
    )
  ),
  add constraint sale_items_category_snapshot_pair_check check (
    (product_category_id is null and product_category_name is null)
    or (product_category_id is not null and product_category_name is not null)
  );

create function private.mark_received_cost_known()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set cost_price = new.unit_cost,
      cost_source = 'purchasing'
  where id = new.product_id
    and business_id = new.business_id;
  return new;
end;
$$;

create trigger purchase_items_mark_received_cost_known
after insert on public.purchase_items
for each row execute function private.mark_received_cost_known();

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_business_id_id_key unique (business_id, id)
);

create unique index expense_categories_business_name_unique_idx
  on public.expense_categories (business_id, lower(name));

create index expense_categories_business_active_name_idx
  on public.expense_categories (business_id, is_active, name);

create trigger expense_categories_set_updated_at
before update on public.expense_categories
for each row execute function private.set_updated_at();

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  category_id uuid not null,
  category_name text not null check (category_name = btrim(category_name) and length(category_name) between 1 and 120),
  amount numeric(19, 4) not null check (amount > 0),
  expense_date date not null,
  description text not null check (description = btrim(description) and length(description) between 1 and 500),
  notes text check (notes is null or (notes = btrim(notes) and length(notes) between 1 and 2000)),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  voided boolean not null default false,
  void_reason text check (void_reason is null or (void_reason = btrim(void_reason) and length(void_reason) between 1 and 1000)),
  voided_by uuid references public.profiles (id) on delete restrict,
  voided_at timestamptz,
  constraint expenses_business_id_id_key unique (business_id, id),
  constraint expenses_business_category_fk foreign key (business_id, category_id)
    references public.expense_categories (business_id, id) on delete restrict,
  constraint expenses_void_state_check check (
    (not voided and void_reason is null and voided_by is null and voided_at is null)
    or (voided and void_reason is not null and voided_by is not null and voided_at is not null)
  )
);

create index expenses_business_date_idx on public.expenses (business_id, expense_date desc);
create index expenses_business_category_date_idx on public.expenses (business_id, category_id, expense_date desc);

create table public.expense_audit (
  id bigint generated always as identity primary key,
  business_id uuid not null,
  expense_id uuid not null,
  action public.expense_audit_action not null,
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb,
  constraint expense_audit_expense_fk foreign key (business_id, expense_id)
    references public.expenses (business_id, id) on delete restrict,
  constraint expense_audit_payload_check check (
    (action = 'created' and before_data is null and after_data is not null)
    or (action in ('updated', 'voided') and before_data is not null and after_data is not null)
  )
);

create index expense_audit_expense_changed_idx on public.expense_audit (expense_id, changed_at);

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_audit enable row level security;

revoke all on table public.expense_categories from public, anon, authenticated;
revoke all on table public.expenses from public, anon, authenticated;
revoke all on table public.expense_audit from public, anon, authenticated;

grant select on table public.expense_categories, public.expenses, public.expense_audit to authenticated;
grant insert (business_id, name) on table public.expense_categories to authenticated;
grant update (name, is_active) on table public.expense_categories to authenticated;

create function private.has_finance_access(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(private.active_business_role(p_business_id) in ('owner', 'manager'), false)
    and exists (
      select 1 from public.business_modules as module
      where module.business_id = p_business_id
        and module.module = 'expenses'
        and module.enabled
    );
$$;

revoke all on function private.has_finance_access(uuid) from public, anon, authenticated;
grant execute on function private.has_finance_access(uuid) to authenticated;

create policy expense_categories_select_finance
on public.expense_categories for select to authenticated
using ((select private.has_finance_access(business_id)));

create policy expense_categories_insert_finance
on public.expense_categories for insert to authenticated
with check ((select private.has_finance_access(business_id)) and not is_system);

create policy expense_categories_update_finance
on public.expense_categories for update to authenticated
using ((select private.has_finance_access(business_id)) and not is_system)
with check ((select private.has_finance_access(business_id)) and not is_system);

create policy expenses_select_finance
on public.expenses for select to authenticated
using ((select private.has_finance_access(business_id)));

create policy expense_audit_select_finance
on public.expense_audit for select to authenticated
using ((select private.has_finance_access(business_id)));

create function private.insert_default_expense_categories(p_business_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.expense_categories (business_id, name, is_system)
  select p_business_id, category_name, true
  from unnest(array['Rent', 'Utilities', 'Transport', 'Salaries & Wages', 'Marketing', 'Maintenance', 'Internet', 'Other']) as category_name
  on conflict (business_id, (lower(name))) do nothing;
$$;

select private.insert_default_expense_categories(id) from public.businesses;

create or replace function private.bootstrap_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_members (business_id, user_id, role, status)
  values (new.id, new.owner_user_id, 'owner', 'active');

  insert into public.business_modules (business_id, module, enabled)
  select new.id, module_name, false
  from unnest(enum_range(null::public.optional_module)) as module_name;

  perform private.insert_default_expense_categories(new.id);
  return new;
end;
$$;

create function public.create_expense(
  p_business_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_expense_date date,
  p_description text,
  p_notes text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_category_name text;
  v_expense public.expenses%rowtype;
begin
  if v_actor is null or (select auth.role()) <> 'authenticated'
    or not private.has_finance_access(p_business_id) then
    raise exception 'Finance access is required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 4)
    or p_amount > 999999999999999.9999 then
    raise exception 'Expense amount must be positive with at most four decimals' using errcode = '22023';
  end if;
  if p_expense_date is null then
    raise exception 'Expense date is required' using errcode = '22023';
  end if;
  if p_description is null or length(btrim(p_description)) not between 1 and 500 then
    raise exception 'Expense description must be between 1 and 500 characters' using errcode = '22023';
  end if;
  if p_notes is not null and length(btrim(p_notes)) not between 1 and 2000 then
    raise exception 'Expense notes must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  select name into v_category_name from public.expense_categories
  where id = p_category_id and business_id = p_business_id and is_active;
  if v_category_name is null then
    raise exception 'Expense category is unavailable' using errcode = '42501';
  end if;

  insert into public.expenses (
    business_id, category_id, category_name, amount, expense_date,
    description, notes, created_by, updated_by
  ) values (
    p_business_id, p_category_id, v_category_name, p_amount, p_expense_date,
    btrim(p_description), nullif(btrim(p_notes), ''), v_actor, v_actor
  ) returning * into v_expense;

  insert into public.expense_audit (business_id, expense_id, action, actor_user_id, after_data)
  values (p_business_id, v_expense.id, 'created', v_actor, to_jsonb(v_expense));
  return v_expense;
end;
$$;

create function public.update_expense(
  p_expense_id uuid,
  p_category_id uuid,
  p_amount numeric,
  p_expense_date date,
  p_description text,
  p_notes text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_before public.expenses%rowtype;
  v_after public.expenses%rowtype;
  v_category_name text;
begin
  select * into v_before from public.expenses where id = p_expense_id for update;
  if not found or v_actor is null or (select auth.role()) <> 'authenticated'
    or not private.has_finance_access(v_before.business_id) then
    raise exception 'Expense is unavailable' using errcode = '42501';
  end if;
  if v_before.voided then
    raise exception 'A voided expense cannot be edited' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 4)
    or p_amount > 999999999999999.9999 then
    raise exception 'Expense amount must be positive with at most four decimals' using errcode = '22023';
  end if;
  if p_expense_date is null or p_description is null or length(btrim(p_description)) not between 1 and 500 then
    raise exception 'Valid expense date and description are required' using errcode = '22023';
  end if;
  if p_notes is not null and length(btrim(p_notes)) not between 1 and 2000 then
    raise exception 'Expense notes must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  select name into v_category_name from public.expense_categories
  where id = p_category_id and business_id = v_before.business_id and is_active;
  if v_category_name is null then
    raise exception 'Expense category is unavailable' using errcode = '42501';
  end if;

  update public.expenses set
    category_id = p_category_id, category_name = v_category_name,
    amount = p_amount, expense_date = p_expense_date,
    description = btrim(p_description), notes = nullif(btrim(p_notes), ''),
    updated_by = v_actor, updated_at = now()
  where id = p_expense_id returning * into v_after;

  insert into public.expense_audit (business_id, expense_id, action, actor_user_id, before_data, after_data)
  values (v_after.business_id, v_after.id, 'updated', v_actor, to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$$;

create function public.void_expense(p_expense_id uuid, p_reason text)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_before public.expenses%rowtype;
  v_after public.expenses%rowtype;
begin
  select * into v_before from public.expenses where id = p_expense_id for update;
  if not found or v_actor is null or (select auth.role()) <> 'authenticated'
    or not private.has_finance_access(v_before.business_id) then
    raise exception 'Expense is unavailable' using errcode = '42501';
  end if;
  if v_before.voided then
    raise exception 'Expense is already voided' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'Void reason must be between 1 and 1000 characters' using errcode = '22023';
  end if;

  update public.expenses set voided = true, void_reason = btrim(p_reason),
    voided_by = v_actor, voided_at = now(), updated_by = v_actor, updated_at = now()
  where id = p_expense_id returning * into v_after;

  insert into public.expense_audit (business_id, expense_id, action, actor_user_id, before_data, after_data)
  values (v_after.business_id, v_after.id, 'voided', v_actor, to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$$;

create function public.get_financial_summary(
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
      coalesce(sum(round(item.quantity * item.estimated_unit_cost_basis, 4))
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
revoke all on function public.get_financial_summary(uuid, date, date) from public, anon, authenticated;
grant execute on function public.create_expense(uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.update_expense(uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
grant execute on function public.get_financial_summary(uuid, date, date) to authenticated;

-- Replace Sales mutation to snapshot the locked product's estimated cost and category.
create or replace function public.record_sale(p_items jsonb, p_notes text default null)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid()); v_business_id uuid; v_first_product_id uuid;
  v_item_count integer; v_sale_number bigint; v_subtotal numeric(19,4); v_sale public.sales%rowtype; v_item record;
begin
  if v_actor_user_id is null or (select auth.role()) <> 'authenticated' then raise exception 'An authenticated user is required to record a sale' using errcode='42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Sale items must be a JSON array' using errcode='22023'; end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 200 then raise exception 'A sale must contain between 1 and 200 items' using errcode='22023'; end if;
  begin select (item->>'product_id')::uuid into v_first_product_id from jsonb_array_elements(p_items) item limit 1;
  exception when invalid_text_representation then raise exception 'Every sale item requires a valid product ID' using errcode='22023'; end;
  if v_first_product_id is null then raise exception 'Every sale item requires a valid product ID' using errcode='22023'; end if;
  select business_id into v_business_id from public.products where id=v_first_product_id;
  if v_business_id is null or not private.is_active_business_member(v_business_id) then raise exception 'Product was not found or is not accessible' using errcode='42501'; end if;
  if not exists(select 1 from public.business_modules where business_id=v_business_id and module='sales' and enabled) then raise exception 'Sales is not enabled for this business' using errcode='42501'; end if;
  begin
    if exists(select 1 from jsonb_array_elements(p_items) item where (item->>'product_id') is null or (item->>'product_id')::uuid is null or (item->>'quantity') is null or (item->>'unit_price') is null or (item->>'quantity')::numeric<=0 or (item->>'quantity')::numeric<>round((item->>'quantity')::numeric,3) or (item->>'unit_price')::numeric<0 or (item->>'unit_price')::numeric<>round((item->>'unit_price')::numeric,4)) then raise exception 'Sale quantities must be positive with at most three decimals and prices nonnegative with at most four decimals' using errcode='22023'; end if;
  exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Sale quantities and prices must be valid decimals' using errcode='22023'; end;
  if exists(select 1 from jsonb_array_elements(p_items) item group by (item->>'product_id')::uuid having count(*)>1) then raise exception 'A product may appear only once in a sale' using errcode='22023'; end if;
  perform product.id from public.products product join jsonb_array_elements(p_items) item on product.id=(item->>'product_id')::uuid where product.business_id=v_business_id order by product.id for update of product;
  if (select count(*) from public.products product join jsonb_array_elements(p_items) item on product.id=(item->>'product_id')::uuid where product.business_id=v_business_id and product.is_active)<>v_item_count then raise exception 'Every sale product must be active and belong to the current business' using errcode='42501'; end if;
  if exists(select 1 from public.products product join jsonb_array_elements(p_items) item on product.id=(item->>'product_id')::uuid where product.business_id=v_business_id and product.current_quantity<(item->>'quantity')::numeric) then raise exception 'Insufficient stock for one or more sale items' using errcode='23514'; end if;
  select sum(round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,4))::numeric(19,4) into v_subtotal from jsonb_array_elements(p_items) item;
  if v_subtotal is null or v_subtotal<0 then raise exception 'Sale total is invalid' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stockpilot-sale:'||v_business_id::text,0));
  select coalesce(max(sale_number),0)+1 into v_sale_number from public.sales where business_id=v_business_id;
  insert into public.sales(business_id,sale_number,subtotal,total,notes,created_by) values(v_business_id,v_sale_number,v_subtotal,v_subtotal,nullif(btrim(p_notes),''),v_actor_user_id) returning * into v_sale;
  insert into public.sale_items(business_id,sale_id,product_id,product_name,product_sku,quantity,unit_price,line_total,estimated_unit_cost_basis,estimated_cost_source,product_category_id,product_category_name)
  select v_business_id,v_sale.id,product.id,product.name,product.sku,(item->>'quantity')::numeric(18,3),(item->>'unit_price')::numeric(19,4),round((item->>'quantity')::numeric*(item->>'unit_price')::numeric,4)::numeric(19,4),
    case when product.cost_source='unknown' then null else product.cost_price end,
    case when product.cost_source='unknown' then null else product.cost_source end,
    product.category_id, category.name
  from public.products product join jsonb_array_elements(p_items) item on product.id=(item->>'product_id')::uuid
  left join public.categories category on category.id=product.category_id and category.business_id=product.business_id
  where product.business_id=v_business_id;
  for v_item in select product.id,product.current_quantity,(item->>'quantity')::numeric(18,3) quantity from public.products product join jsonb_array_elements(p_items) item on product.id=(item->>'product_id')::uuid where product.business_id=v_business_id order by product.id loop
    update public.products set current_quantity=v_item.current_quantity-v_item.quantity where id=v_item.id;
    insert into public.inventory_movements(business_id,product_id,movement_type,quantity,quantity_before,quantity_after,reason,actor_user_id,source_type,source_reference)
    values(v_business_id,v_item.id,'stock_out',-v_item.quantity,v_item.current_quantity,v_item.current_quantity-v_item.quantity,'Sale '||v_sale.sale_reference,v_actor_user_id,'sales',v_sale.id);
  end loop;
  return v_sale;
end;
$$;

comment on column public.products.cost_source is 'Whether latest/default cost is unknown, manually supplied, or established by Purchasing; not an inventory valuation method.';
comment on column public.sale_items.estimated_unit_cost_basis is 'Latest/default product cost snapshotted at sale time when known; an estimate, not accounting COGS.';
comment on table public.expenses is 'Tenant-scoped operating expenses; voided records are preserved and excluded from summaries.';
comment on table public.expense_audit is 'Append-only create/update/void audit history written only by trusted expense RPCs.';
comment on function public.get_financial_summary(uuid,date,date) is 'Owner/manager Finance summary using business-local dates. Profit is null when any selected sale item lacks estimated cost basis; purchase receipts remain separate.';

revoke execute on all functions in schema private from public, anon;
