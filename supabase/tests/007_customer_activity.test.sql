begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000711','authenticated','authenticated','activity-owner@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000712','authenticated','authenticated','activity-manager@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000713','authenticated','authenticated','activity-employee@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000714','authenticated','authenticated','activity-cashier@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000715','authenticated','authenticated','activity-owner-b@stockpilot.test','',now(),'{}','{}',now(),now());
insert into public.businesses (id,name,currency,owner_user_id) values
 ('10000000-0000-0000-0000-000000000711','Activity Business A','USD','00000000-0000-0000-0000-000000000711'),
 ('10000000-0000-0000-0000-000000000712','Activity Business B','USD','00000000-0000-0000-0000-000000000715');
insert into public.business_members (business_id,user_id,role,status) values
 ('10000000-0000-0000-0000-000000000711','00000000-0000-0000-0000-000000000712','manager','active'),
 ('10000000-0000-0000-0000-000000000711','00000000-0000-0000-0000-000000000713','employee','active'),
 ('10000000-0000-0000-0000-000000000711','00000000-0000-0000-0000-000000000714','cashier','active');
update public.business_modules set enabled=true
where business_id='10000000-0000-0000-0000-000000000711' and module in ('sales','customers');
update public.business_modules set enabled=true
where business_id='10000000-0000-0000-0000-000000000712' and module in ('sales','customers');
insert into public.products (id,business_id,name,sku,selling_price) values
 ('30000000-0000-0000-0000-000000000711','10000000-0000-0000-0000-000000000711','Activity Test Item','ACT-1',1),
 ('30000000-0000-0000-0000-000000000712','10000000-0000-0000-0000-000000000712','Other Tenant Item','ACT-2',1);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.record_inventory_movement('30000000-0000-0000-0000-000000000711','stock_in',4,'Activity test','system','40000000-0000-0000-0000-000000000711');
select public.record_inventory_movement('30000000-0000-0000-0000-000000000712','stock_in',4,'Activity test','system','40000000-0000-0000-0000-000000000712');
reset role;
insert into public.customers (id,business_id,name,phone,email,note) values
 ('50000000-0000-0000-0000-000000000712','10000000-0000-0000-0000-000000000712','Tenant B Customer',null,null,'Private B');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000711","role":"authenticated"}',true);
select set_config('test.activity_customer',public.create_customer('10000000-0000-0000-0000-000000000711','Original Snapshot Name','555-0711','activity@example.test','Owner-only note')::text,true);
select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000711","quantity":"1","unit_price":"999999999999999.1234"}]',null,current_setting('test.activity_customer')::uuid);
select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000711","quantity":"1","unit_price":"0.0001"}]',null,current_setting('test.activity_customer')::uuid);
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'customer'->>'note','Owner-only note','owner activity includes authorized current customer note');
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'customer'->>'name','Original Snapshot Name','activity includes current profile name');
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'summary'->>'sale_count','2','owner activity includes associated sale count');
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'summary'->>'recorded_sales_total','999999999999999.1235','Recorded Sales remains exact decimal text beyond JavaScript safe integer');
select ok((public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'summary'->>'first_sale_at')::timestamptz <= (public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'summary'->>'last_sale_at')::timestamptz,'first and last recorded dates are ordered');
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'sales'->0->>'customer_name_snapshot','Original Snapshot Name','history contains immutable customer-name snapshot');
select ok(not (public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid) ? 'estimated_cost') and not (public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'summary' ? 'gross_profit'),'activity contains no Finance or cost metrics');
select throws_ok($$ select public.get_customer_activity('10000000-0000-0000-0000-000000000712',current_setting('test.activity_customer')::uuid) $$,'42501','Customer activity is unavailable for this workspace or role','cross-tenant activity is denied');
select throws_ok($$ select public.get_customer_activity('10000000-0000-0000-0000-000000000711','50000000-0000-0000-0000-000000000712') $$,'42501','Customer was not found or is not accessible','cross-tenant customer ID is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000712","role":"authenticated"}',true);
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'summary'->>'sale_count','2','manager can read customer activity');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000713","role":"authenticated"}',true);
select throws_ok($$ select public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid) $$,'42501','Customer activity is unavailable for this workspace or role','employee cannot call customer activity boundary');
select is((select count(*) from public.sales where business_id='10000000-0000-0000-0000-000000000711' and customer_name_snapshot='Original Snapshot Name'),2::bigint,'employee retains permitted access to individual Sales with snapshot');
select ok(not exists(select 1 from public.lookup_customers('10000000-0000-0000-0000-000000000711') as customer where to_jsonb(customer) ? 'note'),'employee basic lookup does not expose note');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000714","role":"authenticated"}',true);
select throws_ok($$ select public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid) $$,'42501','Customer activity is unavailable for this workspace or role','cashier cannot call customer activity boundary');
select is((select count(*) from public.sales where business_id='10000000-0000-0000-0000-000000000711' and customer_name_snapshot='Original Snapshot Name'),2::bigint,'cashier retains permitted access to individual Sales with snapshot');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000711","role":"authenticated"}',true);
select public.update_customer('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid,'Current Customer Name','555-0711','activity@example.test','Owner-only note');
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'customer'->>'name','Current Customer Name','profile displays current customer name');
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'sales'->0->>'customer_name_snapshot','Original Snapshot Name','customer rename does not rewrite sale-time snapshot');
select public.set_customer_active('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid,false);
select is(public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid)->'customer'->>'is_active','false','inactive profile retains activity');
update public.business_modules set enabled=false where business_id='10000000-0000-0000-0000-000000000711' and module='customers';
select throws_ok($$ select public.get_customer_activity('10000000-0000-0000-0000-000000000711',current_setting('test.activity_customer')::uuid) $$,'42501','Customers is not enabled for this business','customer activity is denied when module disabled');
select is((select count(*) from public.sales where business_id='10000000-0000-0000-0000-000000000711' and customer_name_snapshot='Original Snapshot Name'),2::bigint,'Sales history remains readable when Customers is disabled');
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000711","quantity":"1","unit_price":"1"}]') $$,'walk-in Sales continues when Customers disabled');
reset role;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$ select public.get_customer_activity('10000000-0000-0000-0000-000000000711','50000000-0000-0000-0000-000000000711') $$,'42501','permission denied for function get_customer_activity','anon cannot execute customer activity');
reset role;

select * from finish();
rollback;
