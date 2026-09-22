-- StockPilot Phase 0B: multi-tenant identity, module, and inventory foundation.
-- Detailed grants and RLS policies intentionally belong to the next security phase.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create type public.business_role as enum (
  'owner',
  'manager',
  'employee',
  'cashier'
);

create type public.membership_status as enum (
  'active',
  'inactive',
  'suspended'
);

-- Inventory is deliberately absent: it is core and cannot be toggled.
create type public.optional_module as enum (
  'sales',
  'purchasing',
  'expenses',
  'customers',
  'analytics',
  'smart_insights',
  'team'
);

create type public.inventory_movement_type as enum (
  'stock_in',
  'stock_out',
  'adjustment',
  'damaged',
  'lost'
);

create type public.inventory_source_type as enum (
  'manual',
  'system',
  'sales',
  'purchasing'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  business_type text check (
    business_type is null
    or length(btrim(business_type)) between 1 and 80
  ),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  owner_user_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.business_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_members_business_user_key unique (business_id, user_id)
);

create table public.business_modules (
  business_id uuid not null references public.businesses (id) on delete cascade,
  module public.optional_module not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, module)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (
    description is null
    or length(btrim(description)) between 1 and 1000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_business_id_id_key unique (business_id, id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid,
  name text not null check (length(btrim(name)) between 1 and 200),
  sku text not null check (length(btrim(sku)) between 1 and 100),
  description text check (
    description is null
    or length(btrim(description)) between 1 and 4000
  ),
  cost_price numeric(19, 4) not null default 0 check (cost_price >= 0),
  selling_price numeric(19, 4) not null default 0 check (selling_price >= 0),
  current_quantity numeric(18, 3) not null default 0 check (current_quantity >= 0),
  low_stock_threshold numeric(18, 3) not null default 0 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_business_id_id_key unique (business_id, id),
  constraint products_category_same_business_fk
    foreign key (business_id, category_id)
    references public.categories (business_id, id)
    on delete restrict
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid not null,
  movement_type public.inventory_movement_type not null,
  -- Signed inventory delta: additions are positive and removals are negative.
  quantity numeric(18, 3) not null check (quantity <> 0),
  quantity_before numeric(18, 3) not null check (quantity_before >= 0),
  quantity_after numeric(18, 3) not null check (quantity_after >= 0),
  reason text check (reason is null or length(btrim(reason)) between 1 and 1000),
  actor_user_id uuid references public.profiles (id) on delete set null,
  source_type public.inventory_source_type not null default 'manual',
  source_reference uuid,
  created_at timestamptz not null default now(),
  constraint inventory_movements_product_same_business_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id)
    on delete restrict,
  constraint inventory_movements_quantity_math_check
    check (quantity_after = quantity_before + quantity),
  constraint inventory_movements_quantity_direction_check
    check (
      (movement_type = 'stock_in' and quantity > 0)
      or (movement_type in ('stock_out', 'damaged', 'lost') and quantity < 0)
      or (movement_type = 'adjustment' and quantity <> 0)
    )
);

-- Case-insensitive uniqueness remains scoped to a single tenant.
create unique index categories_business_name_unique_idx
  on public.categories (business_id, lower(btrim(name)));

create unique index products_business_sku_unique_idx
  on public.products (business_id, lower(btrim(sku)));

create unique index business_members_one_active_owner_idx
  on public.business_members (business_id)
  where role = 'owner' and status = 'active';

create index businesses_owner_user_id_idx
  on public.businesses (owner_user_id);

create index business_members_user_id_idx
  on public.business_members (user_id);

create index products_business_category_idx
  on public.products (business_id, category_id);

create index inventory_movements_business_created_at_idx
  on public.inventory_movements (business_id, created_at desc);

create index inventory_movements_product_created_at_idx
  on public.inventory_movements (product_id, created_at desc);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function private.set_updated_at();

create trigger business_members_set_updated_at
before update on public.business_members
for each row execute function private.set_updated_at();

create trigger business_modules_set_updated_at
before update on public.business_modules
for each row execute function private.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'User'
      ),
      120
    )
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create function private.bootstrap_business()
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

  return new;
end;
$$;

create trigger on_business_created
after insert on public.businesses
for each row execute function private.bootstrap_business();

create function private.prevent_business_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Business ownership changes require a dedicated transfer workflow'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger businesses_prevent_owner_change
before update of owner_user_id on public.businesses
for each row execute function private.prevent_business_owner_change();

-- p_quantity is a positive magnitude for stock_in, stock_out, damaged, and lost.
-- For adjustment it is a signed delta. PostgreSQL rolls the entire function back on error.
create function public.record_inventory_movement(
  p_product_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity numeric,
  p_reason text default null,
  p_source_type public.inventory_source_type default 'manual',
  p_source_reference uuid default null
)
returns public.inventory_movements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_delta numeric(18, 3);
  v_quantity_after numeric(18, 3);
  v_movement public.inventory_movements%rowtype;
begin
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

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product % was not found', p_product_id
      using errcode = 'P0002';
  end if;

  v_delta := case
    when p_movement_type in ('stock_out', 'damaged', 'lost') then -p_quantity
    else p_quantity
  end;

  v_quantity_after := v_product.current_quantity + v_delta;

  if v_quantity_after < 0 then
    raise exception 'Insufficient stock: available %, requested change %',
      v_product.current_quantity,
      v_delta
      using errcode = 'check_violation';
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
    auth.uid(),
    p_source_type,
    p_source_reference
  )
  returning * into v_movement;

  return v_movement;
end;
$$;

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_modules enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;

-- Keep browser roles closed until Phase 0C defines reviewed grants and tenant policies.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.businesses from anon, authenticated;
revoke all on table public.business_members from anon, authenticated;
revoke all on table public.business_modules from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.inventory_movements from anon, authenticated;

revoke execute on function public.record_inventory_movement(
  uuid,
  public.inventory_movement_type,
  numeric,
  text,
  public.inventory_source_type,
  uuid
) from public, anon;

grant execute on function public.record_inventory_movement(
  uuid,
  public.inventory_movement_type,
  numeric,
  text,
  public.inventory_source_type,
  uuid
) to authenticated, service_role;

revoke execute on all functions in schema private from public, anon, authenticated;

comment on table public.business_modules is
  'Feature flags for optional modules only. Inventory is core and is always enabled.';

comment on function public.record_inventory_movement(
  uuid,
  public.inventory_movement_type,
  numeric,
  text,
  public.inventory_source_type,
  uuid
) is
  'Atomically locks a product, updates its quantity, and records the signed inventory delta.';
