begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000001201', 'authenticated', 'authenticated', 'quota-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Quota Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000001202', 'authenticated', 'authenticated', 'quota-manager@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Quota Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000001203', 'authenticated', 'authenticated', 'quota-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Quota Employee"}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values (
  '10000000-0000-0000-0000-000000001201', 'Quota Business', 'USD', 'UTC',
  '00000000-0000-0000-0000-000000001201'
);

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000001201', '00000000-0000-0000-0000-000000001202', 'manager', 'active'),
  ('10000000-0000-0000-0000-000000001201', '00000000-0000-0000-0000-000000001203', 'employee', 'active');

update public.business_modules
set enabled = true
where business_id = '10000000-0000-0000-0000-000000001201'
  and module = 'ai_analyst';

select has_table('public', 'ai_analyst_usage', 'usage metadata table exists');
select ok(
  not has_table_privilege('authenticated', 'public.ai_analyst_usage', 'select'),
  'authenticated clients cannot read usage rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.ai_analyst_usage', 'insert'),
  'authenticated clients cannot insert usage rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.ai_analyst_usage', 'update'),
  'authenticated clients cannot forge usage completion directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_ai_analyst_usage(uuid,uuid,uuid)',
    'execute'
  ),
  'authenticated clients cannot call the quota reservation RPC directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_ai_analyst_usage(uuid,uuid,text,text,text,text,integer,integer,integer)',
    'execute'
  ),
  'authenticated clients cannot forge usage completion through the RPC'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_analyst_usage'
      and column_name in ('question', 'prompt', 'context', 'answer', 'payload', 'api_key')
  ),
  'usage schema contains no content or secret columns'
);

set local role anon;
select throws_like(
  $$ select public.reserve_ai_analyst_usage('10000000-0000-0000-0000-000000001201', gen_random_uuid(), '00000000-0000-0000-0000-000000001201') $$,
  '%permission denied%',
  'anonymous callers cannot reserve quota'
);
reset role;

set local role service_role;
select throws_ok(
  $$ select public.reserve_ai_analyst_usage('10000000-0000-0000-0000-000000001201', '20000000-0000-0000-0000-000000001203', '00000000-0000-0000-0000-000000001203') $$,
  '42501', 'AI Analyst access is required', 'employee cannot reserve quota'
);
reset role;

set local role service_role;
select is(
  public.reserve_ai_analyst_usage(
    '10000000-0000-0000-0000-000000001201',
    '20000000-0000-0000-0000-000000001201',
    '00000000-0000-0000-0000-000000001201'
  ),
  'RESERVED',
  'owner can reserve a request'
);
select ok(
  public.complete_ai_analyst_usage(
    '20000000-0000-0000-0000-000000001201',
    '00000000-0000-0000-0000-000000001201', 'succeeded', null,
    'openrouter', 'configured-model', 12, 4, 123
  ),
  'owner can complete their reserved request'
);
select is(
  (select status from public.ai_analyst_usage where request_id = '20000000-0000-0000-0000-000000001201'),
  'succeeded',
  'completion stores only operational status'
);
select throws_ok(
  $$ select public.reserve_ai_analyst_usage('10000000-0000-0000-0000-000000001201', '20000000-0000-0000-0000-000000001201', '00000000-0000-0000-0000-000000001201') $$,
  '23505', 'Request identifier is already reserved', 'request identifiers cannot be replayed'
);

insert into public.ai_analyst_usage (request_id, business_id, user_id, created_at)
select
  ('21000000-0000-0000-0000-' || lpad(series::text, 12, '0'))::uuid,
  '10000000-0000-0000-0000-000000001201',
  '00000000-0000-0000-0000-000000001201',
  statement_timestamp() - interval '5 minutes'
from generate_series(1, 9) as series;

select is(
  public.reserve_ai_analyst_usage(
    '10000000-0000-0000-0000-000000001201',
    '20000000-0000-0000-0000-000000001210',
    '00000000-0000-0000-0000-000000001201'
  ),
  'USER_HOURLY_LIMIT',
  'the eleventh rolling-hour request is denied'
);
reset role;

-- Use rows at today's UTC boundary owned by a different user to isolate the
-- business daily quota from the manager caller's rolling-hour quota.
insert into public.ai_analyst_usage (request_id, business_id, user_id, created_at)
select
  ('22000000-0000-0000-0000-' || lpad(series::text, 12, '0'))::uuid,
  '10000000-0000-0000-0000-000000001201',
  '00000000-0000-0000-0000-000000001203'::uuid,
  date_trunc('day', statement_timestamp()) + interval '1 second'
from generate_series(1, 40) as series;

set local role service_role;
select is(
  public.reserve_ai_analyst_usage(
    '10000000-0000-0000-0000-000000001201',
    '20000000-0000-0000-0000-000000001250',
    '00000000-0000-0000-0000-000000001202'
  ),
  'BUSINESS_DAILY_LIMIT',
  'the fifty-first business-local-day request is denied'
);
reset role;

select * from finish();
rollback;
