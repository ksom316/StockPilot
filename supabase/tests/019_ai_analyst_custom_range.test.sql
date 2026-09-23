begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001901', 'authenticated', 'authenticated', 'analyst-custom-owner@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001902', 'authenticated', 'authenticated', 'analyst-custom-outsider@stockpilot.test', '', now(), '{}', '{}', now(), now());
insert into public.businesses (id, name, timezone, owner_user_id)
values ('10000000-0000-0000-0000-000000001901', 'Custom Analyst Business', 'UTC', '00000000-0000-0000-0000-000000001901'),
       ('10000000-0000-0000-0000-000000001902', 'Other Custom Analyst Business', 'UTC', '00000000-0000-0000-0000-000000001902');
update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000001901' and module = 'ai_analyst';
update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000001902' and module = 'ai_analyst';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001901","role":"authenticated"}', true);
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001901', 'CUSTOM', '2026-09-01', '2026-09-15')->'period'->>'key', 'CUSTOM', 'custom context preserves the custom period key');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001901', 'CUSTOM', '2026-09-01', '2026-09-15')->'period'->>'startDate', '2026-09-01', 'custom context uses the exact requested start date');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001901', 'CUSTOM', '2026-09-01', '2026-09-15')->'period'->>'endDate', '2026-09-15', 'custom context uses the exact requested end date');
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001901', 'CUSTOM', '2026-09-15', '2026-09-01') $$, '22023', 'A valid custom Analyst date range is required', 'reversed custom ranges are denied');
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001901', 'CUSTOM', '2099-01-01', '2099-01-02') $$, '22023', 'A valid custom Analyst date range is required', 'future custom ranges are denied');
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001901', 'CUSTOM', '2025-01-01', '2026-01-02') $$, '22023', 'A valid custom Analyst date range is required', 'oversized custom ranges are denied');
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001902', 'CUSTOM', '2026-09-01', '2026-09-15') $$, '42501', 'Business is unavailable', 'cross-business custom context is denied');
reset role;
select * from finish();
rollback;
