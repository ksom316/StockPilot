-- StockPilot Phase 1B: atomic first-business onboarding.

create function public.create_business_onboarding(
  p_name text,
  p_business_type text default null,
  p_enabled_modules public.optional_module[] default array[]::public.optional_module[]
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
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  -- Serialize first-business creation for this user so retries cannot race.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if exists (
    select 1
    from public.business_members as member
    where member.user_id = v_user_id
      and member.status = 'active'
  ) then
    raise exception 'An active business membership already exists'
      using errcode = '23505';
  end if;

  if p_name is null or length(btrim(p_name)) not between 1 and 160 then
    raise exception 'Business name must be between 1 and 160 characters'
      using errcode = '22023';
  end if;

  if p_business_type is not null
     and length(btrim(p_business_type)) not between 1 and 80 then
    raise exception 'Business type must be between 1 and 80 characters'
      using errcode = '22023';
  end if;

  if array_position(p_enabled_modules, null) is not null then
    raise exception 'Module selection cannot contain null values'
      using errcode = '22023';
  end if;

  insert into public.businesses (name, business_type, owner_user_id)
  values (btrim(p_name), nullif(btrim(p_business_type), ''), v_user_id)
  returning id into v_business_id;

  -- on_business_created has already initialized one disabled row per optional module.
  update public.business_modules
  set enabled = true
  where business_id = v_business_id
    and module = any(coalesce(p_enabled_modules, array[]::public.optional_module[]));

  return v_business_id;
end;
$$;

revoke all on function public.create_business_onboarding(
  text,
  text,
  public.optional_module[]
) from public, anon;

grant execute on function public.create_business_onboarding(
  text,
  text,
  public.optional_module[]
) to authenticated;

comment on function public.create_business_onboarding(
  text,
  text,
  public.optional_module[]
) is
  'Atomically creates the authenticated user''s first business and enables selected optional modules.';
