-- Phase 14B: intentional additional-business creation. First-business onboarding remains unchanged.
create function public.create_additional_business(
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

revoke all on function public.create_additional_business(text, text, public.optional_module[], text) from public, anon;
grant execute on function public.create_additional_business(text, text, public.optional_module[], text) to authenticated;

comment on function public.create_additional_business(text, text, public.optional_module[], text) is
  'Atomically creates an additional business for the authenticated user; the creator is its owner.';
