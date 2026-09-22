begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000011',
    'authenticated',
    'authenticated',
    'onboarding-a@stockpilot.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Onboarding A"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    'authenticated',
    'authenticated',
    'onboarding-b@stockpilot.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Onboarding B"}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.create_business_onboarding('Northstar Market', 'Retail', array['sales', 'analytics']::public.optional_module[]) $$,
  'an authenticated user can complete onboarding'
);

reset role;

select is(
  (
    select count(*)
    from public.business_members
    where user_id = '00000000-0000-0000-0000-000000000011'
      and role = 'owner'
      and status = 'active'
  ),
  1::bigint,
  'the caller receives one active owner membership'
);

select is(
  (
    select count(*)
    from public.business_modules as module
    join public.businesses as business on business.id = module.business_id
    where business.owner_user_id = '00000000-0000-0000-0000-000000000011'
  ),
  8::bigint,
  'all optional module rows are initialized'
);

select is(
  (
    select count(*)
    from public.business_modules as module
    join public.businesses as business on business.id = module.business_id
    where business.owner_user_id = '00000000-0000-0000-0000-000000000011'
      and module.enabled
      and module.module in ('sales', 'analytics')
  ),
  2::bigint,
  'selected optional modules are enabled'
);

select is(
  (
    select count(*)
    from public.business_modules as module
    join public.businesses as business on business.id = module.business_id
    where business.owner_user_id = '00000000-0000-0000-0000-000000000011'
      and not module.enabled
  ),
  6::bigint,
  'unselected optional modules remain disabled'
);

select is(
  (select owner_user_id from public.businesses where name = 'Northstar Market'),
  '00000000-0000-0000-0000-000000000011'::uuid,
  'the RPC always derives ownership from auth.uid()'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.create_business_onboarding('Retry Business', 'Retail', array[]::public.optional_module[]) $$,
  '23505',
  'An active business membership already exists',
  'a retry cannot create a second active business'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.create_business_onboarding('Invalid Modules', 'Retail', array['not_a_module']::public.optional_module[]) $$,
  '22P02',
  'invalid input value for enum optional_module: "not_a_module"',
  'unsupported module names are rejected by the enum boundary'
);

reset role;

select is(
  (select count(*) from public.businesses where owner_user_id = '00000000-0000-0000-0000-000000000012'),
  0::bigint,
  'a rejected module selection leaves no partial business'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ select public.create_business_onboarding('Anonymous Business', 'Retail', array[]::public.optional_module[]) $$,
  '42501',
  'permission denied for function create_business_onboarding',
  'anonymous callers cannot execute onboarding'
);

select * from finish();
rollback;
