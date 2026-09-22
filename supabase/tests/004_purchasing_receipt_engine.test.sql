begin;

create extension if not exists pgtap with schema extensions;

select plan(72);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'purchase-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Purchase Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'purchase-manager@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Purchase Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'purchase-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Purchase Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000204', 'authenticated', 'authenticated', 'purchase-cashier@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Purchase Cashier"}', now(), now()),
  ('00000000-0000-0000-0000-000000000205', 'authenticated', 'authenticated', 'purchase-owner-b@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Purchase Owner B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000206', 'authenticated', 'authenticated', 'purchase-nonmember@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Purchase Nonmember"}', now(), now());

insert into public.businesses (id, name, currency, owner_user_id)
values
  ('10000000-0000-0000-0000-000000000201', 'Purchase Business A', 'USD', '00000000-0000-0000-0000-000000000201'),
  ('10000000-0000-0000-0000-000000000202', 'Purchase Business B', 'USD', '00000000-0000-0000-0000-000000000205');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 'manager', 'active'),
  ('10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000203', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000204', 'cashier', 'active');

update public.business_modules
set enabled = true
where business_id = '10000000-0000-0000-0000-000000000201'
  and module = 'purchasing';

insert into public.suppliers (id, business_id, name, contact_name, email)
values
  ('20000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000201', 'Original Supplier', 'Alex Buyer', 'supplier-a@stockpilot.test'),
  ('20000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000202', 'Other Supplier', null, null),
  ('20000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000201', 'Inactive Supplier', null, null);

update public.suppliers
set is_active = false
where id = '20000000-0000-0000-0000-000000000203';

insert into public.products (id, business_id, name, sku, cost_price, selling_price)
values
  ('30000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000201', 'Coffee Beans', 'BUY-COFFEE', 10.0000, 20.0000),
  ('30000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000201', 'Tea Box', 'BUY-TEA', 4.0000, 9.0000),
  ('30000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000202', 'Other Tenant Product', 'BUY-OTHER', 3.0000, 7.0000),
  ('30000000-0000-0000-0000-000000000204', '10000000-0000-0000-0000-000000000201', 'Inactive Product', 'BUY-INACTIVE', 1.0000, 2.0000);

update public.products
set is_active = false
where id = '30000000-0000-0000-0000-000000000204';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);

select lives_ok(
  $$ select public.record_purchase(
    '[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"5.000","unit_cost":"12.5000"},{"product_id":"30000000-0000-0000-0000-000000000202","quantity":"2.500","unit_cost":"6.0000"}]',
    '40000000-0000-0000-0000-000000000201'
  ) $$,
  'owner can record a multi-item purchase without a supplier'
);
reset role;

select is((select count(*) from public.purchases where business_id = '10000000-0000-0000-0000-000000000201'), 1::bigint, 'purchase header is created');
select is((select purchase_reference from public.purchases where request_id = '40000000-0000-0000-0000-000000000201'), 'PUR-000001', 'first purchase receives the expected reference');
select is((select supplier_id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201'), null::uuid, 'supplier is optional');
select is((select total from public.purchases where request_id = '40000000-0000-0000-0000-000000000201'), 77.5000::numeric, 'purchase total is calculated from received costs');
select is((select count(*) from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201')), 2::bigint, 'one immutable item is created per received product');
select is((select product_name from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') and product_id = '30000000-0000-0000-0000-000000000201'), 'Coffee Beans', 'product name is snapshotted');
select is((select product_sku from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') and product_id = '30000000-0000-0000-0000-000000000201'), 'BUY-COFFEE', 'product SKU is snapshotted');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000201'), 5.000::numeric, 'first product quantity increases');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000202'), 2.500::numeric, 'second product quantity increases');
select is((select cost_price from public.products where id = '30000000-0000-0000-0000-000000000201'), 12.5000::numeric, 'first product cost becomes its latest received cost');
select is((select cost_price from public.products where id = '30000000-0000-0000-0000-000000000202'), 6.0000::numeric, 'second product cost becomes its latest received cost');
select is((select count(*) from public.inventory_movements where source_reference = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201')), 2::bigint, 'one inventory movement is created per received item');
select is((select count(*) from public.inventory_movements where source_reference = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') and movement_type = 'stock_in' and source_type = 'purchasing'), 2::bigint, 'receipt movements are Purchasing stock-in entries');
select is((select count(*) from public.inventory_movements where source_reference = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') and reason = 'Purchase PUR-000001'), 2::bigint, 'receipt movements contain the readable purchase reference');
select is((select actor_user_id from public.inventory_movements where source_reference = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') limit 1), '00000000-0000-0000-0000-000000000201'::uuid, 'receipt movement records the authenticated actor');
select is((select created_by from public.purchases where request_id = '40000000-0000-0000-0000-000000000201'), '00000000-0000-0000-0000-000000000201'::uuid, 'purchase header records the authenticated actor');
select is((select quantity_before from public.inventory_movements where source_reference = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') and product_id = '30000000-0000-0000-0000-000000000201'), 0.000::numeric, 'ledger records the exact quantity before receipt');
select is((select quantity_after from public.inventory_movements where source_reference = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') and product_id = '30000000-0000-0000-0000-000000000201'), 5.000::numeric, 'ledger records the exact quantity after receipt');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}', true);
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"13"}]', '40000000-0000-0000-0000-000000000202') $$, 'manager can record a purchase');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000203","role":"authenticated"}', true);
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000202","quantity":"1","unit_cost":"7"}]', '40000000-0000-0000-0000-000000000203') $$, 'employee can record a purchase');
select is((select count(*) from public.suppliers where business_id = '10000000-0000-0000-0000-000000000201'), 2::bigint, 'employee can read active and inactive supplier information while Purchasing is enabled');
select is_empty(
  $$ update public.suppliers set name = 'Employee Forgery' where id = '20000000-0000-0000-0000-000000000201' returning 1 $$,
  'employee cannot mutate suppliers'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000204","role":"authenticated"}', true);
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"1"}]', '40000000-0000-0000-0000-000000000204') $$, '42501', 'Product was not found or is not accessible', 'cashier cannot record a purchase');
select is((select count(*) from public.purchases where business_id = '10000000-0000-0000-0000-000000000201'), 0::bigint, 'cashier cannot read purchases');
select is((select count(*) from public.purchase_items where business_id = '10000000-0000-0000-0000-000000000201'), 0::bigint, 'cashier cannot read purchase items');
select is((select count(*) from public.suppliers where business_id = '10000000-0000-0000-0000-000000000201'), 0::bigint, 'cashier cannot read suppliers');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000206","role":"authenticated"}', true);
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"1"}]', '40000000-0000-0000-0000-000000000205') $$, '42501', 'Product was not found or is not accessible', 'nonmember cannot record a purchase');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000205","role":"authenticated"}', true);
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000203","quantity":"1","unit_cost":"3"}]', '40000000-0000-0000-0000-000000000206') $$, '42501', 'Purchasing is not enabled for this business', 'Purchasing-disabled business cannot record a purchase');
select is((select count(*) from public.purchases where business_id = '10000000-0000-0000-0000-000000000201'), 0::bigint, 'cross-tenant purchase reads are hidden');
select is((select count(*) from public.suppliers where business_id = '10000000-0000-0000-0000-000000000201'), 0::bigint, 'cross-tenant supplier reads are hidden');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000203","quantity":"1","unit_cost":"3"}]', '40000000-0000-0000-0000-000000000207') $$, '42501', 'Product was not found or is not accessible', 'cross-tenant first product is rejected');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"3"},{"product_id":"30000000-0000-0000-0000-000000000203","quantity":"1","unit_cost":"3"}]', '40000000-0000-0000-0000-000000000222') $$, '42501', 'Every purchase product must be active and belong to the current business', 'cross-tenant product in a multi-item receipt is rejected');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"3"}]', '40000000-0000-0000-0000-000000000208', '20000000-0000-0000-0000-000000000202') $$, '42501', 'Supplier was not found, is inactive, or belongs to another business', 'cross-tenant supplier is rejected');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"3"}]', '40000000-0000-0000-0000-000000000209', '20000000-0000-0000-0000-000000000203') $$, '42501', 'Supplier was not found, is inactive, or belongs to another business', 'inactive supplier is rejected');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000204","quantity":"1","unit_cost":"3"}]', '40000000-0000-0000-0000-000000000210') $$, '42501', 'Every purchase product must be active and belong to the current business', 'inactive product is rejected');
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"2","unit_cost":"14.2500"}]', '40000000-0000-0000-0000-000000000211', '20000000-0000-0000-0000-000000000201', 'Supplier receipt') $$, 'purchase with a valid same-business supplier succeeds');
reset role;

select is((select supplier_name from public.purchases where request_id = '40000000-0000-0000-0000-000000000211'), 'Original Supplier', 'supplier name is snapshotted on the purchase');
update public.suppliers set name = 'Renamed Supplier' where id = '20000000-0000-0000-0000-000000000201';
update public.products set name = 'Renamed Coffee', sku = 'BUY-COFFEE-NEW' where id = '30000000-0000-0000-0000-000000000201';
select is((select supplier_name from public.purchases where request_id = '40000000-0000-0000-0000-000000000211'), 'Original Supplier', 'supplier snapshot survives later edits');
select is((select product_name from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') and product_id = '30000000-0000-0000-0000-000000000201'), 'Coffee Beans', 'product name snapshot survives later edits');
select is((select product_sku from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201') and product_id = '30000000-0000-0000-0000-000000000201'), 'BUY-COFFEE', 'product SKU snapshot survives later edits');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select is(
  (select (public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"5.000","unit_cost":"12.5000"},{"product_id":"30000000-0000-0000-0000-000000000202","quantity":"2.500","unit_cost":"6.0000"}]', '40000000-0000-0000-0000-000000000201')).id),
  (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201'),
  'an exact idempotent retry returns the original purchase identity'
);
reset role;

select is((select count(*) from public.purchases where business_id = '10000000-0000-0000-0000-000000000201'), 4::bigint, 'idempotent retry creates no additional purchase');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000201'), 8.000::numeric, 'idempotent retry does not increase stock twice');
select is((select count(*) from public.inventory_movements where source_reference = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000201')), 2::bigint, 'idempotent retry creates no duplicate movements');

update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000000202' and module = 'purchasing';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000205","role":"authenticated"}', true);
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000203","quantity":"1","unit_cost":"3"}]', '40000000-0000-0000-0000-000000000201') $$, 'another business can use the same idempotency UUID independently');
reset role;
select is((select purchase_reference from public.purchases where business_id = '10000000-0000-0000-0000-000000000202'), 'PUR-000001', 'purchase reference numbering is scoped per business');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"15"}]', '40000000-0000-0000-0000-000000000212') $$, 'later receipt at a different cost succeeds');
reset role;
select is((select cost_price from public.products where id = '30000000-0000-0000-0000-000000000201'), 15.0000::numeric, 'catalog cost reflects the latest received cost');
select is((select unit_cost from public.purchase_items where purchase_id = (select id from public.purchases where business_id = '10000000-0000-0000-0000-000000000201' and request_id = '40000000-0000-0000-0000-000000000201') and product_id = '30000000-0000-0000-0000-000000000201'), 12.5000::numeric, 'earlier transaction cost snapshot remains unchanged');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000202","quantity":"1","unit_cost":"0"}]', '40000000-0000-0000-0000-000000000213') $$, 'zero-cost received stock is allowed');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"0","unit_cost":"1"}]', '40000000-0000-0000-0000-000000000214') $$, '22023', 'Purchase quantities must be positive with at most three decimals and costs nonnegative with at most four decimals', 'zero quantity is rejected');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"-0.01"}]', '40000000-0000-0000-0000-000000000215') $$, '22023', 'Purchase quantities must be positive with at most three decimals and costs nonnegative with at most four decimals', 'negative cost is rejected');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1.0001","unit_cost":"1"}]', '40000000-0000-0000-0000-000000000216') $$, '22023', 'Purchase quantities must be positive with at most three decimals and costs nonnegative with at most four decimals', 'excess quantity precision is rejected');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"1.00001"}]', '40000000-0000-0000-0000-000000000217') $$, '22023', 'Purchase quantities must be positive with at most three decimals and costs nonnegative with at most four decimals', 'excess cost precision is rejected');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"1"},{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"2","unit_cost":"1"}]', '40000000-0000-0000-0000-000000000218') $$, '22023', 'A product may appear only once in a purchase', 'duplicate product IDs are rejected');
select throws_like($$ insert into public.purchases (business_id, purchase_number, request_id, subtotal, total, created_by) values ('10000000-0000-0000-0000-000000000201', 99, gen_random_uuid(), 1, 1, '00000000-0000-0000-0000-000000000201') $$, '%permission denied%', 'direct purchase insertion is denied');
select throws_like($$ insert into public.purchase_items (business_id, purchase_id, product_id, product_name, product_sku, quantity, unit_cost, line_total) values ('10000000-0000-0000-0000-000000000201', gen_random_uuid(), '30000000-0000-0000-0000-000000000201', 'Forged', 'FORGED', 1, 1, 1) $$, '%permission denied%', 'direct purchase-item insertion is denied');
reset role;

select is((select cost_price from public.products where id = '30000000-0000-0000-0000-000000000202'), 0.0000::numeric, 'zero-cost receipt updates latest cost to zero');
select is((select count(distinct purchase_reference) from public.purchases where business_id = '10000000-0000-0000-0000-000000000201'), 6::bigint, 'purchase references are unique within a business');

update public.products set current_quantity = 999999999999999.500 where id = '30000000-0000-0000-0000-000000000202';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"20"},{"product_id":"30000000-0000-0000-0000-000000000202","quantity":"1","unit_cost":"8"}]', '40000000-0000-0000-0000-000000000219') $$, '22003', 'Purchase quantity would exceed the supported stock balance', 'multi-item overflow rejects the entire receipt');
reset role;
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000201'), 9.000::numeric, 'failed multi-item receipt leaves earlier product quantity unchanged');
select is((select cost_price from public.products where id = '30000000-0000-0000-0000-000000000201'), 15.0000::numeric, 'failed multi-item receipt leaves earlier product cost unchanged');
select is((select count(*) from public.purchases where request_id = '40000000-0000-0000-0000-000000000219'), 0::bigint, 'failed multi-item receipt creates no purchase header');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.record_purchase('[]', '40000000-0000-0000-0000-000000000220') $$, '42501', 'permission denied for function record_purchase', 'anonymous execution is rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}', true);
select lives_ok($$ update public.suppliers set phone = '555-0102' where id = '20000000-0000-0000-0000-000000000201' $$, 'manager can edit a supplier');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select lives_ok($$ insert into public.suppliers (business_id, name) values ('10000000-0000-0000-0000-000000000201', 'Owner Created Supplier') $$, 'owner can create a supplier');
reset role;

update public.business_modules set enabled = false where business_id = '10000000-0000-0000-0000-000000000201' and module = 'purchasing';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}', true);
select is((select count(*) from public.purchases where business_id = '10000000-0000-0000-0000-000000000201'), 0::bigint, 'disabled Purchasing hides purchase reads');
select is((select count(*) from public.purchase_items where business_id = '10000000-0000-0000-0000-000000000201'), 0::bigint, 'disabled Purchasing hides purchase-item reads');
select is((select count(*) from public.suppliers where business_id = '10000000-0000-0000-0000-000000000201'), 0::bigint, 'disabled Purchasing hides supplier reads');
select throws_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000201","quantity":"1","unit_cost":"1"}]', '40000000-0000-0000-0000-000000000221') $$, '42501', 'Purchasing is not enabled for this business', 'disabled Purchasing blocks new receipts');
select lives_ok($$ select public.record_inventory_movement('30000000-0000-0000-0000-000000000201', 'stock_in', 1, 'Manual stock still works') $$, 'manual Inventory remains functional when Purchasing is disabled');
reset role;

select * from finish();
rollback;
