begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('00000000-0000-0000-0000-000000000701','authenticated','authenticated','customer-owner@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000702','authenticated','authenticated','customer-manager@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000703','authenticated','authenticated','customer-employee@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000704','authenticated','authenticated','customer-cashier@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000705','authenticated','authenticated','customer-owner-b@stockpilot.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000706','authenticated','authenticated','customer-outsider@stockpilot.test','',now(),'{}','{}',now(),now());

insert into public.businesses (id, name, currency, owner_user_id) values
 ('10000000-0000-0000-0000-000000000701','Customer Business A','USD','00000000-0000-0000-0000-000000000701'),
 ('10000000-0000-0000-0000-000000000702','Customer Business B','USD','00000000-0000-0000-0000-000000000705');
insert into public.business_members (business_id,user_id,role,status) values
 ('10000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000702','manager','active'),
 ('10000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000703','employee','active'),
 ('10000000-0000-0000-0000-000000000701','00000000-0000-0000-0000-000000000704','cashier','active');
update public.business_modules set enabled=true
where business_id='10000000-0000-0000-0000-000000000701' and module in ('sales','customers');
update public.business_modules set enabled=true
where business_id='10000000-0000-0000-0000-000000000702' and module in ('sales','customers');
insert into public.products (id,business_id,name,sku,selling_price) values
 ('30000000-0000-0000-0000-000000000701','10000000-0000-0000-0000-000000000701','Customer Test Product','CUS-1',3.25),
 ('30000000-0000-0000-0000-000000000702','10000000-0000-0000-0000-000000000702','Other Tenant Product','CUS-2',3.25);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.record_inventory_movement('30000000-0000-0000-0000-000000000701','stock_in',30,'Customer test','system','40000000-0000-0000-0000-000000000701');
select public.record_inventory_movement('30000000-0000-0000-0000-000000000702','stock_in',30,'Customer test','system','40000000-0000-0000-0000-000000000702');
reset role;
insert into public.customers (id,business_id,name,phone,email,note) values
 ('50000000-0000-0000-0000-000000000702','10000000-0000-0000-0000-000000000702','Tenant B',null,null,'Private');

select has_table('public','customers','customer table exists');
select ok((select confdeltype='r' from pg_constraint where conname='sales_customer_same_business_fk'),'customer FK restricts deletion and tenant-crossing');
select ok((select confdeltype='r' from pg_constraint where conname='customers_business_id_fkey'),'business deletion does not cascade customers');
select throws_like($$ insert into public.customers (business_id,name) values ('10000000-0000-0000-0000-000000000701','   ') $$,'%customers_name_check%','blank customer name is rejected');
select lives_ok($$ insert into public.customers (business_id,name) values ('10000000-0000-0000-0000-000000000701','Same Name'),('10000000-0000-0000-0000-000000000701','Same Name') $$,'duplicate names are allowed');
select lives_ok($$ insert into public.customers (business_id,name,phone,email) values ('10000000-0000-0000-0000-000000000701','No Contact',null,null) $$,'phone and email are optional');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}',true);
select set_config('test.customer_id',public.create_customer('10000000-0000-0000-0000-000000000701','Alice','555-0100','alice@example.test','VIP note')::text,true);
select is((select note from public.customers where id=current_setting('test.customer_id')::uuid),'VIP note','owner can create and read a private note');
select lives_ok($$ select public.set_customer_active('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,false) $$,'owner can deactivate');
select lives_ok($$ select public.set_customer_active('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,true) $$,'owner can reactivate');
select lives_ok($$ select public.update_customer('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,'Alice Renamed','555-0100','alice@example.test','VIP note') $$,'owner can edit customer');
select throws_like($$ delete from public.customers where id=current_setting('test.customer_id')::uuid $$,'%permission denied%','normal hard deletion is not granted');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}',true);
select lives_ok($$ select public.update_customer('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,'Manager Edit',null,null,'Manager note') $$,'manager can edit customer');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000703","role":"authenticated"}',true);
select is((select name from public.lookup_customers('10000000-0000-0000-0000-000000000701') where id=current_setting('test.customer_id')::uuid),'Manager Edit','employee can read basic active customer');
select is((select count(*) from public.customers where id=current_setting('test.customer_id')::uuid),0::bigint,'employee direct table reads are denied by RLS');
select is((select count(*) from public.lookup_customers('10000000-0000-0000-0000-000000000701'))::integer,4,'employee lookup returns only active customer records');
select throws_ok($$ select public.create_customer('10000000-0000-0000-0000-000000000701','No Note','555-0101',null,'forged') $$,'42501','Employees and cashiers cannot create customer notes','employee cannot inject note');
select set_config('test.employee_customer_id',public.create_customer('10000000-0000-0000-0000-000000000701','Quick Add','555-0101',null,null)::text,true);
select throws_ok($$ select public.update_customer('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,'No',null,null,null) $$,'42501','Only an owner or manager may update customers','employee cannot edit');
select throws_ok($$ select public.set_customer_active('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,false) $$,'42501','Only an owner or manager may change customer status','employee cannot deactivate');
select throws_like($$ update public.customers set name='Direct' where id=current_setting('test.customer_id')::uuid $$,'%permission denied%','direct customer update is denied');
select throws_like($$ select public.create_customer('10000000-0000-0000-0000-000000000702','Cross Tenant',null,null,null) $$,'%Customer business is not accessible%','cross-tenant customer creation is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000704","role":"authenticated"}',true);
select is((select count(*) from public.lookup_customers('10000000-0000-0000-0000-000000000701'))::integer,5,'cashier can browse basic active customers');
select is((select count(*) from public.customers where id=current_setting('test.customer_id')::uuid),0::bigint,'cashier direct table reads are denied by RLS');
select set_config('test.cashier_customer_id',public.create_customer('10000000-0000-0000-0000-000000000701','Cashier Add',null,null,null)::text,true);
select throws_ok($$ select public.update_customer('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,'No',null,null,null) $$,'42501','Only an owner or manager may update customers','cashier cannot edit');
select throws_ok($$ select public.set_customer_active('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,false) $$,'42501','Only an owner or manager may change customer status','cashier cannot deactivate');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000703","role":"authenticated"}',true);
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000701","quantity":"1","unit_price":"3.25"}]') $$,'walk-in sale works with Customers enabled');
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000701","quantity":"1","unit_price":"3.25"}]',null,current_setting('test.customer_id')::uuid) $$,'employee can associate active customer in atomic sale');
reset role;

select is((select count(*) from public.sales where business_id='10000000-0000-0000-0000-000000000701' and customer_id is null and customer_name_snapshot is null),1::bigint,'walk-in sales store NULL association and snapshot');
select is((select customer_name_snapshot from public.sales where business_id='10000000-0000-0000-0000-000000000701' and customer_id is not null),'Manager Edit','linked sale stores customer name at sale time');
select ok(not exists (select 1 from pg_attribute where attrelid='public.sales'::regclass and attname in ('customer_phone_snapshot','customer_email_snapshot') and not attisdropped),'Sales schema has no customer phone/email snapshot columns');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}',true);
select lives_ok($$ select public.update_customer('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,'Renamed Again','555-0100','alice@example.test','VIP note') $$,'owner can rename linked customer');
select lives_ok($$ select public.set_customer_active('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,false) $$,'owner can deactivate linked customer');
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000701","quantity":"1","unit_price":"3.25"}]',null,current_setting('test.customer_id')::uuid) $$,'42501','Customer was not found, is inactive, or is not accessible','inactive customer cannot be associated');
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000701","quantity":"1","unit_price":"3.25"}]',null,'50000000-0000-0000-0000-000000000702') $$,'42501','Customer was not found, is inactive, or is not accessible','cross-tenant customer association is rejected');
select is((select customer_name_snapshot from public.sales where business_id='10000000-0000-0000-0000-000000000701' and customer_id is not null),'Manager Edit','rename/deactivation does not change historical snapshot');
update public.business_modules set enabled=false where business_id='10000000-0000-0000-0000-000000000701' and module='customers';
select is((select count(*) from public.customers where business_id='10000000-0000-0000-0000-000000000701'),0::bigint,'customer reads are hidden when module disabled');
select throws_ok($$ select public.create_customer('10000000-0000-0000-0000-000000000701','Disabled',null,null,null) $$,'42501','Customers is not enabled for this business','customer create is blocked when disabled');
select throws_ok($$ select public.update_customer('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,'Disabled',null,null,null) $$,'42501','Customers is not enabled for this business','customer edit is blocked when disabled');
select throws_ok($$ select public.set_customer_active('10000000-0000-0000-0000-000000000701',current_setting('test.customer_id')::uuid,true) $$,'42501','Customers is not enabled for this business','customer lifecycle changes are blocked when disabled');
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000701","quantity":"1","unit_price":"3.25"}]',null,current_setting('test.customer_id')::uuid) $$,'42501','Customers is not enabled for this business','customer-linked sale is blocked when Customers disabled');
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000701","quantity":"1","unit_price":"3.25"}]') $$,'walk-in sale still works when Customers disabled');
select is((select customer_name_snapshot from public.sales where business_id='10000000-0000-0000-0000-000000000701' and customer_id is not null),'Manager Edit','historical sale snapshot remains available when Customers disabled');
update public.business_modules set enabled=false where business_id='10000000-0000-0000-0000-000000000701' and module='sales';
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000701","quantity":"1","unit_price":"3.25"}]') $$,'42501','Sales is not enabled for this business','Sales-disabled behavior remains enforced');
reset role;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$ select public.create_customer('10000000-0000-0000-0000-000000000701','Anon',null,null,null) $$,'42501','permission denied for function create_customer','anonymous customer creation is denied');
reset role;

select * from finish();
rollback;
