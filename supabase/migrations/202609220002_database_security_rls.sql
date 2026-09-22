-- StockPilot Phase 0C: grants, tenant isolation, and role-based RLS policies.

-- These helpers must bypass business_members RLS because that table's own
-- policies depend on membership checks. They live outside exposed API schemas,
-- use a locked search path, and expose only facts about the current auth.uid().
create or replace function private.is_active_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members as member
    where member.business_id = p_business_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  );
$$;

create or replace function private.active_business_role(p_business_id uuid)
returns public.business_role
language sql
stable
security definer
set search_path = ''
as $$
  select member.role
  from public.business_members as member
  where member.business_id = p_business_id
    and member.user_id = (select auth.uid())
    and member.status = 'active'
  limit 1;
$$;

create or replace function private.is_business_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.businesses as business
    join public.business_members as member
      on member.business_id = business.id
     and member.user_id = business.owner_user_id
     and member.role = 'owner'
     and member.status = 'active'
    where business.id = p_business_id
      and business.owner_user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_active_business_member(uuid) from public, anon, authenticated;
revoke all on function private.active_business_role(uuid) from public, anon, authenticated;
revoke all on function private.is_business_owner(uuid) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_active_business_member(uuid) to authenticated;
grant execute on function private.active_business_role(uuid) to authenticated;
grant execute on function private.is_business_owner(uuid) to authenticated;

-- Start from an explicit deny baseline, then grant only the operations and
-- columns used by authenticated application clients.
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.businesses from public, anon, authenticated;
revoke all on table public.business_members from public, anon, authenticated;
revoke all on table public.business_modules from public, anon, authenticated;
revoke all on table public.categories from public, anon, authenticated;
revoke all on table public.products from public, anon, authenticated;
revoke all on table public.inventory_movements from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select on table public.businesses to authenticated;
grant insert (name, business_type, currency, owner_user_id) on table public.businesses to authenticated;
grant update (name, business_type, currency) on table public.businesses to authenticated;

grant select on table public.business_members to authenticated;
grant insert (business_id, user_id, role, status) on table public.business_members to authenticated;
grant update (role, status) on table public.business_members to authenticated;
grant delete on table public.business_members to authenticated;

grant select on table public.business_modules to authenticated;
grant update (enabled) on table public.business_modules to authenticated;

grant select on table public.categories to authenticated;
grant insert (business_id, name, description) on table public.categories to authenticated;
grant update (name, description) on table public.categories to authenticated;
grant delete on table public.categories to authenticated;

grant select on table public.products to authenticated;
grant insert (
  business_id,
  category_id,
  name,
  sku,
  description,
  cost_price,
  selling_price,
  low_stock_threshold,
  is_active
) on table public.products to authenticated;
grant update (
  category_id,
  name,
  sku,
  description,
  cost_price,
  selling_price,
  low_stock_threshold,
  is_active
) on table public.products to authenticated;
grant delete on table public.products to authenticated;

grant select on table public.inventory_movements to authenticated;

-- Profiles: a user can see and edit only their own public profile row.
create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Businesses: active members can read; owners can edit mutable settings.
-- Creating a business is limited to assigning the caller as its initial owner.
create policy businesses_select_active_member
on public.businesses
for select
to authenticated
using ((select private.is_active_business_member(id)));

create policy businesses_insert_self_as_owner
on public.businesses
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy businesses_update_owner
on public.businesses
for update
to authenticated
using ((select private.is_business_owner(id)))
with check ((select private.is_business_owner(id)));

-- Memberships: active members can see their business roster. Only the owner
-- can add, change, or remove non-owner memberships. Ownership transfer and
-- mutation of the owner's membership remain deliberately unavailable.
create policy business_members_select_active_member
on public.business_members
for select
to authenticated
using ((select private.is_active_business_member(business_id)));

create policy business_members_insert_owner
on public.business_members
for insert
to authenticated
with check (
  (select private.is_business_owner(business_id))
  and role <> 'owner'
);

create policy business_members_update_owner
on public.business_members
for update
to authenticated
using (
  (select private.is_business_owner(business_id))
  and role <> 'owner'
)
with check (
  (select private.is_business_owner(business_id))
  and role <> 'owner'
);

create policy business_members_delete_owner
on public.business_members
for delete
to authenticated
using (
  (select private.is_business_owner(business_id))
  and role <> 'owner'
);

-- Optional modules: every active member can read; only the owner can toggle.
create policy business_modules_select_active_member
on public.business_modules
for select
to authenticated
using ((select private.is_active_business_member(business_id)));

create policy business_modules_update_owner
on public.business_modules
for update
to authenticated
using ((select private.is_business_owner(business_id)))
with check ((select private.is_business_owner(business_id)));

-- Categories: cashiers read; owner, manager, and employee roles manage.
create policy categories_select_active_member
on public.categories
for select
to authenticated
using ((select private.is_active_business_member(business_id)));

create policy categories_insert_inventory_staff
on public.categories
for insert
to authenticated
with check (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
);

create policy categories_update_inventory_staff
on public.categories
for update
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
)
with check (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
);

create policy categories_delete_inventory_staff
on public.categories
for delete
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
);

-- Products use the same role model. Column grants exclude business_id and
-- current_quantity from updates and exclude current_quantity from inserts.
create policy products_select_active_member
on public.products
for select
to authenticated
using ((select private.is_active_business_member(business_id)));

create policy products_insert_inventory_staff
on public.products
for insert
to authenticated
with check (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
);

create policy products_update_inventory_staff
on public.products
for update
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
)
with check (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
);

create policy products_delete_inventory_staff
on public.products
for delete
to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
);

-- Movement history is read-only to clients. Inserts are performed only by the
-- authorized inventory RPC below; no client INSERT/UPDATE/DELETE grant exists.
create policy inventory_movements_select_active_member
on public.inventory_movements
for select
to authenticated
using ((select private.is_active_business_member(business_id)));

-- SECURITY DEFINER is required here so the function can update the protected
-- current_quantity column and insert immutable history without granting either
-- capability directly to clients. Every authenticated call is authorized from
-- auth.uid(), and client-originated movements are restricted to manual sources.
create or replace function public.record_inventory_movement(
  p_product_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity numeric,
  p_reason text default null,
  p_source_type public.inventory_source_type default 'manual',
  p_source_reference uuid default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_delta numeric(18, 3);
  v_quantity_after numeric(18, 3);
  v_movement public.inventory_movements%rowtype;
  v_actor_user_id uuid := (select auth.uid());
  v_request_role text := (select auth.role());
begin
  if p_movement_type is null then
    raise exception 'Movement type is required'
      using errcode = '22023';
  end if;

  if p_source_type is null then
    raise exception 'Movement source type is required'
      using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'Movement quantity must be non-zero'
      using errcode = '22023';
  end if;

  if p_quantity <> round(p_quantity, 3) then
    raise exception 'Movement quantity supports at most three decimal places'
      using errcode = '22023';
  end if;

  if p_movement_type in ('stock_in', 'stock_out', 'damaged', 'lost') and p_quantity < 0 then
    raise exception 'Quantity must be positive for % movements', p_movement_type
      using errcode = '22023';
  end if;

  if v_actor_user_id is not null then
    if p_source_type <> 'manual' or p_source_reference is not null then
      raise exception 'Authenticated inventory adjustments must use a manual source without a source reference'
        using errcode = '42501';
    end if;

    select *
    into v_product
    from public.products as product
    where product.id = p_product_id
      and private.active_business_role(product.business_id) in ('owner', 'manager', 'employee')
    for update;

    if not found then
      raise exception 'Product was not found or is not accessible'
        using errcode = '42501';
    end if;
  else
    if coalesce(v_request_role, '') <> 'service_role'
      and session_user not in ('postgres', 'service_role') then
      raise exception 'An authenticated user or trusted service role is required'
        using errcode = '42501';
    end if;

    select *
    into v_product
    from public.products as product
    where product.id = p_product_id
    for update;

    if not found then
      raise exception 'Product was not found'
        using errcode = 'P0002';
    end if;
  end if;

  v_delta := case
    when p_movement_type in ('stock_out', 'damaged', 'lost') then -p_quantity
    else p_quantity
  end;

  v_quantity_after := v_product.current_quantity + v_delta;

  if v_quantity_after < 0 then
    raise exception 'Inventory movement would produce negative stock'
      using errcode = '23514';
  end if;

  update public.products
  set current_quantity = v_quantity_after
  where id = v_product.id;

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
  )
  values (
    v_product.business_id,
    v_product.id,
    p_movement_type,
    v_delta,
    v_product.current_quantity,
    v_quantity_after,
    nullif(btrim(p_reason), ''),
    v_actor_user_id,
    p_source_type,
    p_source_reference
  )
  returning * into v_movement;

  return v_movement;
end;
$$;

revoke all on function public.record_inventory_movement(
  uuid,
  public.inventory_movement_type,
  numeric,
  text,
  public.inventory_source_type,
  uuid
) from public, anon, authenticated;

grant execute on function public.record_inventory_movement(
  uuid,
  public.inventory_movement_type,
  numeric,
  text,
  public.inventory_source_type,
  uuid
) to authenticated, service_role;

-- Keep future public tables and functions opt-in for client roles when they are
-- created by the migration owner.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

comment on function private.is_active_business_member(uuid) is
  'RLS helper: reports whether auth.uid() has an active membership in a business.';

comment on function private.active_business_role(uuid) is
  'RLS helper: returns auth.uid() active role in a business, or null.';

comment on function private.is_business_owner(uuid) is
  'RLS helper: verifies auth.uid() is the active immutable owner of a business.';

comment on function public.record_inventory_movement(
  uuid,
  public.inventory_movement_type,
  numeric,
  text,
  public.inventory_source_type,
  uuid
) is
  'Authorized stock mutation boundary. Locks the product, prevents negative stock, updates quantity, and records the authenticated actor atomically.';
