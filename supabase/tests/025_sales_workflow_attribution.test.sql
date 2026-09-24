begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000281', 'authenticated', 'authenticated', 'sales-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Kwaku"}', now(), now()),
  ('00000000-0000-0000-0000-000000000282', 'authenticated', 'authenticated', 'sales-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Ama"}', now(), now()),
  ('00000000-0000-0000-0000-000000000283', 'authenticated', 'authenticated', 'sales-business-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Kojo"}', now(), now());

insert into public.businesses (id, name, business_type, currency, owner_user_id)
values
  ('10000000-0000-0000-0000-000000000281', 'Sales Test A', 'Frozen Foods', 'GHS', '00000000-0000-0000-0000-000000000281'),
  ('10000000-0000-0000-0000-000000000282', 'Sales Test B', 'Retail', 'GHS', '00000000-0000-0000-0000-000000000283');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000281', '00000000-0000-0000-0000-000000000282', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000000282', '00000000-0000-0000-0000-000000000282', 'manager', 'active');

update public.business_modules
set enabled = true
where business_id in ('10000000-0000-0000-0000-000000000281', '10000000-0000-0000-0000-000000000282')
  and module in ('sales', 'customers');

insert into public.products (id, business_id, name, sku, cost_price, selling_price, current_quantity)
values
  ('30000000-0000-0000-0000-000000000281', '10000000-0000-0000-0000-000000000281', 'Frozen Wings', 'WINGS-281', 10, 20, 10),
  ('30000000-0000-0000-0000-000000000282', '10000000-0000-0000-0000-000000000282', 'Rice', 'RICE-282', 5, 10, 3);

insert into public.customers (id, business_id, name)
values ('50000000-0000-0000-0000-000000000281', '10000000-0000-0000-0000-000000000281', 'Adwoa''s Catering');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000281","role":"authenticated"}', true);

select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000281","quantity":"1","unit_price":"20"}]') $$, 'anonymous sale uses defaults');
select is((select sales_channel from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 1), 'walk_in', 'default channel is Walk-in');
select is((select payment_method from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 1), 'cash', 'default payment method is Cash');
select is((select customer_id from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 1), null::uuid, 'anonymous sale has no customer');
select is((select recorded_by_name_snapshot from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 1), 'Kwaku', 'owner sale snapshots recorder name');
select is((select recorded_by_role_snapshot from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 1), 'owner'::public.business_role, 'owner sale snapshots business role');

select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000281","quantity":"1","unit_price":"20"}]', 'Known customer', '50000000-0000-0000-0000-000000000281', 'delivery', 'mobile_money') $$, 'known customer delivery sale succeeds');
select is((select customer_name_snapshot from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 2), 'Adwoa''s Catering', 'known customer name is snapshotted');
select is((select sales_channel from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 2), 'delivery', 'delivery channel is stored separately');
select is((select payment_method from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 2), 'mobile_money', 'payment method is independent of channel');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000282","role":"authenticated"}', true);
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000281","quantity":"1","unit_price":"20"}]', null, null, 'pickup', 'bank_transfer') $$, 'employee pickup sale succeeds');
select is((select recorded_by_name_snapshot from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 3), 'Ama', 'employee sale snapshots employee name');
select is((select recorded_by_role_snapshot from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 3), 'employee'::public.business_role, 'employee role is resolved within business A');
select is((select sales_channel from public.sales where business_id = '10000000-0000-0000-0000-000000000281' and sale_number = 3), 'pickup', 'pickup channel is stored');

select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000282","quantity":"1","unit_price":"10"}]', null, null, 'other', 'card') $$, 'same user can record in another business');
select is((select recorded_by_role_snapshot from public.sales where business_id = '10000000-0000-0000-0000-000000000282' and sale_number = 1), 'manager'::public.business_role, 'recorder role is business-scoped');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000281'), 7.000::numeric, 'sales still deduct inventory atomically');

select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000281","quantity":"1","unit_price":"20"}]', null, null, 'whatsapp', 'cash') $$, '22023', 'Sales channel is invalid', 'unsupported channel is rejected');

select * from finish();
rollback;
