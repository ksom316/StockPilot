begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'multi-business@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Multi Business"}'::jsonb, now(), now());
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'other-business@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Other Business"}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}', true);

select lives_ok($$ select public.create_business_onboarding('Primary Workspace', 'Retail', array['sales']::public.optional_module[]) $$, 'the account can create its first workspace');
select lives_ok($$ select public.create_additional_business('Second Workspace', 'Wholesale', array['analytics']::public.optional_module[], 'warehouse') $$, 'the account can intentionally create another workspace');

reset role;
select is((select count(*) from public.businesses where owner_user_id = '00000000-0000-0000-0000-000000000021'), 2::bigint, 'both workspaces belong to the authenticated creator');
select is((select count(*) from public.business_members where user_id = '00000000-0000-0000-0000-000000000021' and role = 'owner' and status = 'active'), 2::bigint, 'the creator owns both workspaces');
select is((select icon_id from public.businesses where name = 'Second Workspace'), 'warehouse', 'the curated icon is persisted');
select is((select count(*) from public.business_modules module join public.businesses business on business.id = module.business_id where business.name = 'Second Workspace' and module.module = 'analytics' and module.enabled), 1::bigint, 'selected modules are enabled only on the new workspace');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.create_additional_business('Anonymous Workspace', 'Retail', array[]::public.optional_module[], 'store') $$, '42501', 'permission denied for function create_additional_business', 'anonymous callers cannot create workspaces');

reset role;
select is((select count(*) from public.businesses where name = 'Anonymous Workspace'), 0::bigint, 'anonymous creation leaves no business');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}', true);
select public.create_business_onboarding('Other User Workspace', 'Retail', array[]::public.optional_module[]);
select is((select count(*) from public.businesses where owner_user_id = '00000000-0000-0000-0000-000000000021'), 0::bigint, 'a member cannot read another user''s businesses through RLS');
select is((select count(*) from public.business_members member join public.businesses business on business.id = member.business_id where business.owner_user_id = '00000000-0000-0000-0000-000000000021'), 0::bigint, 'a member cannot read another user''s memberships through RLS');

select * from finish();
rollback;
