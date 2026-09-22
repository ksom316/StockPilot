-- StockPilot Phase 10B: content-free AI Analyst quota and usage metadata.
-- Prompts, questions, context, answers, and provider payloads are never stored.

create table public.ai_analyst_usage (
  request_id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  status text not null default 'reserved'
    check (status in ('reserved', 'succeeded', 'failed')),
  error_category text check (
    error_category is null
    or error_category in (
      'INVALID_PROVIDER_RESPONSE',
      'PROVIDER_UNAVAILABLE',
      'PROVIDER_TIMEOUT',
      'INTERNAL_ERROR'
    )
  ),
  provider text check (provider is null or length(provider) between 1 and 40),
  model text check (model is null or length(model) between 1 and 200),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0)
);

create index ai_analyst_usage_user_created_idx
on public.ai_analyst_usage (user_id, created_at desc);

create index ai_analyst_usage_business_created_idx
on public.ai_analyst_usage (business_id, created_at desc);

alter table public.ai_analyst_usage enable row level security;

revoke all on table public.ai_analyst_usage from public, anon, authenticated;

comment on table public.ai_analyst_usage is
  'Content-free AI Analyst quota and operational metadata. Never stores prompts, questions, context, answers, or provider payloads.';

create table private.ai_analyst_quota_config (
  singleton boolean primary key default true check (singleton),
  user_hourly_limit integer not null check (user_hourly_limit between 1 and 1000),
  business_daily_limit integer not null check (business_daily_limit between 1 and 10000)
);

insert into private.ai_analyst_quota_config (
  singleton, user_hourly_limit, business_daily_limit
) values (true, 10, 50);

revoke all on table private.ai_analyst_quota_config from public, anon, authenticated;

create function public.reserve_ai_analyst_usage(
  p_business_id uuid,
  p_request_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role public.business_role;
  v_timezone text;
  v_business_day_start timestamptz;
  v_business_day_end timestamptz;
  v_user_hourly_limit integer;
  v_business_daily_limit integer;
begin
  if p_business_id is null or p_request_id is null or p_user_id is null then
    raise exception 'Business, request, and user identifiers are required' using errcode = '22023';
  end if;

  select member.role
  into v_role
  from public.business_members as member
  where member.business_id = p_business_id
    and member.user_id = p_user_id
    and member.status = 'active';
  if v_role is null then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'manager') then
    raise exception 'AI Analyst access is required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.business_modules as module
    where module.business_id = p_business_id
      and module.module = 'ai_analyst'
      and module.enabled
  ) then
    raise exception 'AI Analyst is not enabled for this business' using errcode = '42501';
  end if;

  select business.timezone
  into v_timezone
  from public.businesses as business
  where business.id = p_business_id;

  -- Every reservation takes these locks in the same order. The user lock makes
  -- the rolling-hour count atomic, and the business lock makes the local-day
  -- count atomic even when several users submit concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-analyst-user:' || p_user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-analyst-business:' || p_business_id::text, 0)
  );

  if exists (
    select 1
    from public.ai_analyst_usage as usage
    where usage.request_id = p_request_id
  ) then
    raise exception 'Request identifier is already reserved' using errcode = '23505';
  end if;

  select config.user_hourly_limit, config.business_daily_limit
  into v_user_hourly_limit, v_business_daily_limit
  from private.ai_analyst_quota_config as config
  where config.singleton;

  if (
    select count(*)
    from public.ai_analyst_usage as usage
    where usage.user_id = p_user_id
      and usage.created_at >= statement_timestamp() - interval '1 hour'
  ) >= v_user_hourly_limit then
    return 'USER_HOURLY_LIMIT';
  end if;

  v_business_day_start := (
    (statement_timestamp() at time zone v_timezone)::date::timestamp
    at time zone v_timezone
  );
  v_business_day_end := (
    ((statement_timestamp() at time zone v_timezone)::date + 1)::timestamp
    at time zone v_timezone
  );

  if (
    select count(*)
    from public.ai_analyst_usage as usage
    where usage.business_id = p_business_id
      and usage.created_at >= v_business_day_start
      and usage.created_at < v_business_day_end
  ) >= v_business_daily_limit then
    return 'BUSINESS_DAILY_LIMIT';
  end if;

  insert into public.ai_analyst_usage (request_id, business_id, user_id)
  values (p_request_id, p_business_id, p_user_id);

  return 'RESERVED';
end;
$$;

create function public.complete_ai_analyst_usage(
  p_request_id uuid,
  p_user_id uuid,
  p_status text,
  p_error_category text default null,
  p_provider text default null,
  p_model text default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_latency_ms integer default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_updated boolean;
begin
  if p_request_id is null or p_user_id is null or p_status not in ('succeeded', 'failed') then
    raise exception 'Invalid usage completion' using errcode = '22023';
  end if;
  if (p_status = 'succeeded' and p_error_category is not null)
    or (p_status = 'failed' and p_error_category is null) then
    raise exception 'Usage result is inconsistent' using errcode = '22023';
  end if;

  update public.ai_analyst_usage as usage
  set status = p_status,
      error_category = p_error_category,
      provider = p_provider,
      model = p_model,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      latency_ms = p_latency_ms
  where usage.request_id = p_request_id
    and usage.user_id = p_user_id
    and usage.status = 'reserved';

  v_updated := found;
  return v_updated;
end;
$$;

revoke all on function public.reserve_ai_analyst_usage(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_ai_analyst_usage(
  uuid, uuid, text, text, text, text, integer, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.reserve_ai_analyst_usage(uuid, uuid, uuid)
  to service_role;
grant execute on function public.complete_ai_analyst_usage(
  uuid, uuid, text, text, text, text, integer, integer, integer
) to service_role;

comment on function public.reserve_ai_analyst_usage(uuid, uuid, uuid) is
  'Atomically reserves owner/manager AI Analyst quota: 10 per user rolling hour and 50 per business-local day.';
comment on function public.complete_ai_analyst_usage(
  uuid, uuid, text, text, text, text, integer, integer, integer
) is
  'Service-only completion of a user-owned reserved usage row with bounded content-free operational metadata.';
