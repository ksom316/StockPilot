begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'sales-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sales Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'sales-manager@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sales Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'sales-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sales Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000104', 'authenticated', 'authenticated', 'sales-cashier@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sales Cashier"}', now(), now()),
  ('00000000-0000-0000-0000-000000000105', 'authenticated', 'authenticated', 'sales-owner-b@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sales Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000106', 'authenticated', 'authenticated', 'sales-nonmember@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sales Nonmember"}', now(), now());

insert into public.businesses (id, name, currency, owner_user_id)
values
  ('10000000-0000-0000-0000-000000000101', 'Sales Business A', 'USD', '00000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000102', 'Sales Business B', 'USD', '00000000-0000-0000-0000-000000000105');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'manager', 'active'),
  ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 'cashier', 'active');

update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000000101' and module = 'sales';

insert into public.products (id, business_id, name, sku, selling_price)
values
  ('30000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', 'Coffee Beans', 'COFFEE-1', 4.2500),
  ('30000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000101', 'Tea Box', 'TEA-1', 8.0000),
  ('30000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000102', 'Other Tenant Item', 'OTHER-1', 5.0000);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.record_inventory_movement('30000000-0000-0000-0000-000000000101', 'stock_in', 20, 'Sales test stock', 'system', '40000000-0000-0000-0000-000000000101');
select public.record_inventory_movement('30000000-0000-0000-0000-000000000102', 'stock_in', 10, 'Sales test stock', 'system', '40000000-0000-0000-0000-000000000102');
select public.record_inventory_movement('30000000-0000-0000-0000-000000000103', 'stock_in', 5, 'Sales test stock', 'system', '40000000-0000-0000-0000-000000000103');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);

select lives_ok(
  $$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"2.000","unit_price":"3.5000"},{"product_id":"30000000-0000-0000-0000-000000000102","quantity":"1.500","unit_price":"7.0000"}]', 'Opening sale') $$,
  'owner can record a multi-item sale when Sales is enabled'
);
reset role;

select is((select count(*) from public.sales where business_id = '10000000-0000-0000-0000-000000000101'), 1::bigint, 'sale header is created');
select is((select total from public.sales where business_id = '10000000-0000-0000-0000-000000000101'), 17.5000::numeric, 'sale total is calculated from transaction prices');
select is((select count(*) from public.sale_items where sale_id = (select id from public.sales where business_id = '10000000-0000-0000-0000-000000000101')), 2::bigint, 'one immutable line is created per sold product');
select is((select count(*) from public.sale_items where unit_price in (3.5000, 7.0000)), 2::bigint, 'historical unit prices are stored');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000101'), 18.000::numeric, 'first product quantity is reduced');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000102'), 8.500::numeric, 'second product quantity is reduced');
select is((select count(*) from public.inventory_movements where source_reference = (select id from public.sales where business_id = '10000000-0000-0000-0000-000000000101')), 2::bigint, 'each sold product receives an inventory movement');
select is((select count(*) from public.inventory_movements where source_reference = (select id from public.sales where business_id = '10000000-0000-0000-0000-000000000101') and source_type = 'sales'), 2::bigint, 'sale movements use the Sales source');
select is((select count(*) from public.inventory_movements where source_reference = (select id from public.sales where business_id = '10000000-0000-0000-0000-000000000101') and reason = 'Sale SALE-000001'), 2::bigint, 'sale movements reference the correct sale');
select is((select created_by from public.sales where business_id = '10000000-0000-0000-0000-000000000101'), '00000000-0000-0000-0000-000000000101'::uuid, 'sale records auth.uid as actor');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"0.500","unit_price":"4.2500"}]') $$, 'manager can record a sale');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}', true);
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"0.500","unit_price":"4.2500"}]') $$, 'employee can record a sale');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000104","role":"authenticated"}', true);
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"0.500","unit_price":"4.2500"}]') $$, 'cashier can record a sale');
select throws_ok(
  $$ select public.record_inventory_movement('30000000-0000-0000-0000-000000000101', 'stock_out', 1, 'Cashier manual stock out') $$,
  '42501', 'Product was not found or is not accessible',
  'cashier still cannot record a manual inventory adjustment'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000106","role":"authenticated"}', true);
select throws_ok(
  $$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"1","unit_price":"1"}]') $$,
  '42501', 'Product was not found or is not accessible', 'nonmember cannot record a sale'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
select throws_ok(
  $$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000103","quantity":"1","unit_price":"1"}]') $$,
  '42501', 'Product was not found or is not accessible', 'cross-tenant product is rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000105","role":"authenticated"}', true);
select throws_ok(
  $$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000103","quantity":"1","unit_price":"5"}]') $$,
  '42501', 'Sales is not enabled for this business', 'Sales-disabled business cannot record a sale'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
select throws_ok(
  $$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"1","unit_price":"4"},{"product_id":"30000000-0000-0000-0000-000000000102","quantity":"999","unit_price":"8"}]') $$,
  '23514', 'Insufficient stock for one or more sale items', 'insufficient stock rejects a multi-item sale'
);
reset role;

select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000101'), 16.500::numeric, 'failed multi-item sale rolls back first product deduction');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000102'), 8.500::numeric, 'failed multi-item sale leaves second product unchanged');
select is((select count(*) from public.sales where business_id = '10000000-0000-0000-0000-000000000101'), 4::bigint, 'failed multi-item sale creates no header');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}', true);
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"0","unit_price":"1"}]') $$, '22023', 'Sale quantities must be positive with at most three decimals and prices nonnegative with at most four decimals', 'zero quantity is rejected');
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"-1","unit_price":"1"}]') $$, '22023', 'Sale quantities must be positive with at most three decimals and prices nonnegative with at most four decimals', 'negative quantity is rejected');
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"1","unit_price":"-0.01"}]') $$, '22023', 'Sale quantities must be positive with at most three decimals and prices nonnegative with at most four decimals', 'negative price is rejected');
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"1","unit_price":"1"},{"product_id":"30000000-0000-0000-0000-000000000101","quantity":"2","unit_price":"1"}]') $$, '22023', 'A product may appear only once in a sale', 'duplicate products are rejected clearly');
select throws_like($$ insert into public.sales (business_id, sale_number, subtotal, total, created_by) values ('10000000-0000-0000-0000-000000000101', 99, 1, 1, '00000000-0000-0000-0000-000000000101') $$, '%permission denied%', 'direct client sale insertion is denied');
select throws_like($$ insert into public.sale_items (business_id, sale_id, product_id, product_name, product_sku, quantity, unit_price, line_total) values ('10000000-0000-0000-0000-000000000101', gen_random_uuid(), '30000000-0000-0000-0000-000000000101', 'Forged', 'FORGED', 1, 1, 1) $$, '%permission denied%', 'direct client item insertion is denied');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.record_sale('[]') $$, '42501', 'permission denied for function record_sale', 'anonymous execution is rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000105","role":"authenticated"}', true);
select is((select count(*) from public.sales where business_id = '10000000-0000-0000-0000-000000000101'), 0::bigint, 'cross-tenant sales reads are hidden');
select is((select count(*) from public.sale_items where business_id = '10000000-0000-0000-0000-000000000101'), 0::bigint, 'cross-tenant sale-item reads are hidden');
reset role;

select is((select count(distinct sale_reference) from public.sales where business_id = '10000000-0000-0000-0000-000000000101'), 4::bigint, 'sale references are unique within a business');

update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000000102' and module = 'sales';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000105","role":"authenticated"}', true);
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000103","quantity":"1","unit_price":"5"}]') $$, 'another business can record its first sale');
reset role;
select is((select sale_reference from public.sales where business_id = '10000000-0000-0000-0000-000000000102'), 'SALE-000001', 'sale numbering is scoped to each business');

update public.products set name = 'Renamed Coffee', sku = 'COFFEE-NEW', selling_price = 99 where id = '30000000-0000-0000-0000-000000000101';
select is((select product_name from public.sale_items where sale_id = (select id from public.sales where business_id = '10000000-0000-0000-0000-000000000101' and sale_number = 1) and product_id = '30000000-0000-0000-0000-000000000101'), 'Coffee Beans', 'product name snapshot survives a rename');
select is((select product_sku from public.sale_items where sale_id = (select id from public.sales where business_id = '10000000-0000-0000-0000-000000000101' and sale_number = 1) and product_id = '30000000-0000-0000-0000-000000000101'), 'COFFEE-1', 'SKU snapshot survives a product edit');
select is((select unit_price from public.sale_items where sale_id = (select id from public.sales where business_id = '10000000-0000-0000-0000-000000000101' and sale_number = 1) and product_id = '30000000-0000-0000-0000-000000000101'), 3.5000::numeric, 'transaction price survives product repricing');
select is((select selling_price from public.products where id = '30000000-0000-0000-0000-000000000101'), 99.0000::numeric, 'recorded sale prices do not mutate catalog pricing');

select * from finish();
rollback;
