begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001601', 'authenticated', 'authenticated', 'report-owner@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001602', 'authenticated', 'authenticated', 'report-employee@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001603', 'authenticated', 'authenticated', 'report-cashier@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001604', 'authenticated', 'authenticated', 'report-other@stockpilot.test', '', now(), '{}', '{}', now(), now());
insert into public.businesses (id, name, currency, timezone, owner_user_id)
values ('10000000-0000-0000-0000-000000001601', 'Reports Business', 'USD', 'America/New_York', '00000000-0000-0000-0000-000000001601'), ('10000000-0000-0000-0000-000000001602', 'Other Reports Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001604');
insert into public.business_members (business_id, user_id, role, status) values
  ('10000000-0000-0000-0000-000000001601', '00000000-0000-0000-0000-000000001602', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000001601', '00000000-0000-0000-0000-000000001603', 'cashier', 'active');
update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000001601' and module in ('sales', 'expenses');
insert into public.products (id, business_id, name, sku, current_quantity, low_stock_threshold, cost_price, cost_source) values ('30000000-0000-0000-0000-000000001601', '10000000-0000-0000-0000-000000001601', 'Report Product', 'REPORT-1', 4.125, 2, 3.2500, 'manual');

set local role anon;
select throws_like($$ select public.get_report('10000000-0000-0000-0000-000000001601', 'inventory', current_date, current_date) $$, '%permission denied%', 'anonymous report access is denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001601","role":"authenticated"}', true);
select is(public.get_report('10000000-0000-0000-0000-000000001601', 'inventory', (current_date at time zone 'America/New_York')::date, (current_date at time zone 'America/New_York')::date)->>'reportType', 'inventory', 'owner can load inventory report');
select is(public.get_report('10000000-0000-0000-0000-000000001601', 'inventory', (current_date at time zone 'America/New_York')::date, (current_date at time zone 'America/New_York')::date)->'rows'->0->>'currentQuantity', '4.125', 'inventory quantities remain exact decimal strings');
select throws_ok($$ select public.get_report('10000000-0000-0000-0000-000000001601', 'purchasing', current_date, current_date) $$, '42501', 'Purchasing is not enabled for this business', 'disabled Purchasing is gated');
select throws_ok($$ select public.get_report('10000000-0000-0000-0000-000000001601', 'expenses', current_date + 1, current_date + 1) $$, '22023', 'Report dates cannot be in the future', 'future report dates are denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001603","role":"authenticated"}', true);
select throws_ok($$ select public.get_report('10000000-0000-0000-0000-000000001601', 'sales', current_date, current_date) $$, '42501', 'This report is not available for your role', 'cashier cannot access broad Sales reporting');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001604","role":"authenticated"}', true);
select throws_ok($$ select public.get_report('10000000-0000-0000-0000-000000001601', 'inventory', current_date, current_date) $$, '42501', 'Business is unavailable', 'cross-business reporting is denied');
reset role;
select * from finish();
rollback;
