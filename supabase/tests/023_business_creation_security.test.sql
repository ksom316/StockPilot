begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000041', 'authenticated', 'authenticated', 'creation-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Creation Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000042', 'authenticated', 'authenticated', 'creation-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Creation Employee"}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}', true);
select public.create_business_onboarding('Creation Security Workspace', 'Retail', array[]::public.optional_module[]);

reset role;
insert into public.business_members (business_id, user_id, role, status)
select id, '00000000-0000-0000-0000-000000000042', 'employee', 'active'
from public.businesses where name = 'Creation Security Workspace';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000042","role":"authenticated"}', true);
select throws_ok($$ select public.create_additional_business('Employee Workspace', 'Retail', array[]::public.optional_module[], 'store') $$, '42501', 'Additional business creation requires an active owner membership', 'non-owner members cannot create additional businesses');
select throws_ok($$ insert into public.businesses (name, business_type, owner_user_id) values ('Direct Workspace', 'Retail', '00000000-0000-0000-0000-000000000042') $$, '42501', 'permission denied for table businesses', 'authenticated clients cannot bypass the business creation RPC');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}', true);
select lives_ok($$ select public.create_additional_business('Owner Workspace', 'Retail', array[]::public.optional_module[], 'store') $$, 'an active owner can create an additional business through the RPC');
select is((select count(*) from public.businesses where owner_user_id = '00000000-0000-0000-0000-000000000041'), 2::bigint, 'owner creation remains atomic and owner-scoped');

select * from finish();
rollback;
