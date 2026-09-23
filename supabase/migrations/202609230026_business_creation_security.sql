-- Phase 15A: business creation must remain behind the authorized RPC boundary.
-- Direct client INSERT is not needed: both first-business onboarding and
-- intentional additional-business creation are SECURITY DEFINER RPCs.
revoke insert on table public.businesses from authenticated;

create or replace function public.create_additional_business(
  p_name text,
  p_business_type text,
  p_enabled_modules public.optional_module[] default array[]::public.optional_module[],
  p_icon_id text default 'store'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_members
    where user_id = v_user_id and status = 'active' and role = 'owner'
  ) then
    raise exception 'Additional business creation requires an active owner membership' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 then
    raise exception 'Business name must be between 1 and 160 characters' using errcode = '22023';
  end if;
  if p_business_type is null or length(btrim(p_business_type)) not between 1 and 80 then
    raise exception 'Business type must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if array_position(p_enabled_modules, null) is not null then
    raise exception 'Module selection cannot contain null values' using errcode = '22023';
  end if;
  if p_icon_id is null or p_icon_id not in ('store', 'building', 'warehouse', 'landmark', 'shopping-bag') then
    raise exception 'Business icon is not supported' using errcode = '22023';
  end if;

  insert into public.businesses (name, business_type, owner_user_id, icon_id)
  values (btrim(p_name), btrim(p_business_type), v_user_id, p_icon_id)
  returning id into v_business_id;

  update public.business_modules
  set enabled = true
  where business_id = v_business_id
    and module = any(coalesce(p_enabled_modules, array[]::public.optional_module[]));

  return v_business_id;
end;
$$;

create or replace function public.create_additional_business(
  p_name text,
  p_business_type text,
  p_enabled_modules public.optional_module[],
  p_icon_id text,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_members
    where user_id = v_user_id and status = 'active' and role = 'owner'
  ) then
    raise exception 'Additional business creation requires an active owner membership' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 then
    raise exception 'Business name must be between 1 and 160 characters' using errcode = '22023';
  end if;
  if p_business_type is null or length(btrim(p_business_type)) not between 1 and 80 then
    raise exception 'Business type must be between 1 and 80 characters' using errcode = '22023';
  end if;
  if p_currency is null or p_currency not in ('GHS', 'USD', 'EUR', 'GBP', 'NGN', 'ZAR') then
    raise exception 'Business currency is not supported' using errcode = '22023';
  end if;
  if array_position(p_enabled_modules, null) is not null then
    raise exception 'Module selection cannot contain null values' using errcode = '22023';
  end if;
  if p_icon_id is null or p_icon_id not in ('store', 'building', 'warehouse', 'landmark', 'shopping-bag') then
    raise exception 'Business icon is not supported' using errcode = '22023';
  end if;

  insert into public.businesses (name, business_type, owner_user_id, icon_id, currency)
  values (btrim(p_name), btrim(p_business_type), v_user_id, p_icon_id, p_currency)
  returning id into v_business_id;

  update public.business_modules
  set enabled = true
  where business_id = v_business_id
    and module = any(coalesce(p_enabled_modules, array[]::public.optional_module[]));

  return v_business_id;
end;
$$;
