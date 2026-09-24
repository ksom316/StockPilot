begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000241', 'authenticated', 'authenticated', 'conversion-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Conversion Owner"}', now(), now());

insert into public.businesses (id, name, business_type, currency, owner_user_id)
values ('10000000-0000-0000-0000-000000000241', 'Cold Store', 'Frozen Foods', 'GHS', '00000000-0000-0000-0000-000000000241');

update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000000241' and module in ('purchasing', 'sales');

insert into public.products (id, business_id, name, sku, base_unit, purchase_unit, purchase_conversion_quantity, selling_price, low_stock_threshold)
values
  ('30000000-0000-0000-0000-000000000241', '10000000-0000-0000-0000-000000000241', 'Chicken Wings', 'WINGS', 'kg', 'carton', 10, 45, 30),
  ('30000000-0000-0000-0000-000000000242', '10000000-0000-0000-0000-000000000241', 'Whole Chicken', 'WHOLE', 'piece', 'carton', 10, 50, 5),
  ('30000000-0000-0000-0000-000000000243', '10000000-0000-0000-0000-000000000241', 'Sausages', 'SAUSAGE', 'pack', 'carton', 20, 12, 10),
  ('30000000-0000-0000-0000-000000000244', '10000000-0000-0000-0000-000000000241', 'Ice Bag', 'ICE', 'pack', 'pack', 1, 5, 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000241","role":"authenticated"}', true);

select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000241","quantity":"3","unit_cost":"300"},{"product_id":"30000000-0000-0000-0000-000000000242","quantity":"2","unit_cost":"400"},{"product_id":"30000000-0000-0000-0000-000000000243","quantity":"2","unit_cost":"200"},{"product_id":"30000000-0000-0000-0000-000000000244","quantity":"3","unit_cost":"4"}]', '40000000-0000-0000-0000-000000000241') $$, 'multiple purchase units are received atomically');
reset role;

select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000241'), 30.000::numeric, 'three cartons add thirty kg');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000242'), 20.000::numeric, 'two cartons add twenty pieces');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000243'), 40.000::numeric, 'two cartons add forty packs');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000244'), 3.000::numeric, 'same-unit products retain quantity behavior');
select is((select cost_price from public.products where id = '30000000-0000-0000-0000-000000000241'), 30.0000::numeric, 'carton cost is converted to kg cost');
select is((select line_total from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000241') and product_id = '30000000-0000-0000-0000-000000000241'), 900.0000::numeric, 'carton line total remains purchase quantity times carton cost');
select is((select total from public.purchases where request_id = '40000000-0000-0000-0000-000000000241'), 2112.0000::numeric, 'purchase total sums purchase-unit line totals');
select is((select inventory_quantity from public.purchase_items where product_id = '30000000-0000-0000-0000-000000000241'), 30.000::numeric, 'receipt snapshots converted inventory quantity');
select is((select quantity from public.purchase_items where product_id = '30000000-0000-0000-0000-000000000241'), 3.000::numeric, 'receipt preserves purchase-unit quantity');
select is((select base_unit_cost from public.purchase_items where product_id = '30000000-0000-0000-0000-000000000241'), 30.0000::numeric, 'receipt snapshots base-unit cost');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000241","role":"authenticated"}', true);
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000241","quantity":"2.5","unit_price":"45"}]') $$, 'decimal kg sale succeeds');
reset role;

select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000241'), 27.500::numeric, 'stock after decimal sale remains exact');
select ok((select current_quantity <= low_stock_threshold from public.products where id = '30000000-0000-0000-0000-000000000241'), 'low stock compares base-unit quantity and threshold');
select is((select estimated_unit_cost_basis from public.sale_items where product_id = '30000000-0000-0000-0000-000000000241'), 30.0000::numeric, 'sale snapshots converted base-unit cost for profit');
select is((select quantity from public.inventory_movements where product_id = '30000000-0000-0000-0000-000000000241' and source_type = 'purchasing'), 30.000::numeric, 'purchase movement records base-unit stock increase');
select is((select quantity from public.inventory_movements where product_id = '30000000-0000-0000-0000-000000000241' and source_type = 'sales'), -2.500::numeric, 'sale movement records decimal base-unit decrease');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000241","role":"authenticated"}', true);
select lives_ok($$ update public.products set purchase_conversion_quantity = 12 where id = '30000000-0000-0000-0000-000000000241' $$, 'product conversion can change for future receipts');
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000241","quantity":"1","unit_cost":"360"}]', '40000000-0000-0000-0000-000000000242') $$, 'future receipt uses the updated conversion');
reset role;

select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000241'), 39.500::numeric, 'future conversion adds twelve kg without rewriting prior stock');
select is((select total from public.purchases where request_id = '40000000-0000-0000-0000-000000000242'), 360.0000::numeric, 'future purchase total remains one carton times carton cost');
select is((select purchase_conversion_quantity from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000241') and product_id = '30000000-0000-0000-0000-000000000241'), 10.000::numeric, 'historical receipt keeps its original conversion');
select is((select inventory_quantity from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000242') and product_id = '30000000-0000-0000-0000-000000000241'), 12.000::numeric, 'future receipt snapshots the new converted quantity');
select is((select base_unit_cost from public.purchase_items where purchase_id = (select id from public.purchases where request_id = '40000000-0000-0000-0000-000000000242') and product_id = '30000000-0000-0000-0000-000000000241'), 30.0000::numeric, 'future base-unit cost derives from the new conversion');

select throws_ok(
  $$ insert into public.products (business_id, name, sku, base_unit, purchase_unit, purchase_conversion_quantity) values ('10000000-0000-0000-0000-000000000241', 'Invalid', 'INVALID', 'kg', 'carton', 0) $$,
  '23514', null, 'zero conversion quantity is rejected'
);

select throws_ok(
  $$ insert into public.products (business_id, name, sku, base_unit, purchase_unit, purchase_conversion_quantity) values ('10000000-0000-0000-0000-000000000241', 'Invalid Same Unit', 'INVALID-SAME', 'pack', 'pack', 2) $$,
  '23514', null, 'same-unit products require a conversion of one'
);

select * from finish();
rollback;
