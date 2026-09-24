begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000261', 'authenticated', 'authenticated', 'multi-unit-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Multi Unit Owner"}', now(), now());

insert into public.businesses (id, name, business_type, currency, owner_user_id)
values ('10000000-0000-0000-0000-000000000261', 'Multi Unit Cold Store', 'Frozen Foods', 'GHS', '00000000-0000-0000-0000-000000000261');

update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000000261' and module = 'sales';

insert into public.products (id, business_id, name, sku, base_unit, purchase_unit, purchase_conversion_quantity, cost_price, selling_price, current_quantity, low_stock_threshold, cost_source)
values
  ('30000000-0000-0000-0000-000000000261', '10000000-0000-0000-0000-000000000261', 'Chicken Wings', 'WINGS-261', 'kg', 'carton', 10, 30, 45, 30, 20, 'purchasing'),
  ('30000000-0000-0000-0000-000000000262', '10000000-0000-0000-0000-000000000261', 'Whole Chicken', 'WHOLE-261', 'piece', 'carton', 10, 40, 60, 30, 5, 'purchasing'),
  ('30000000-0000-0000-0000-000000000263', '10000000-0000-0000-0000-000000000261', 'Sausages', 'SAUSAGE-261', 'pack', 'carton', 20, 5, 12, 50, 10, 'purchasing'),
  ('30000000-0000-0000-0000-000000000264', '10000000-0000-0000-0000-000000000261', 'Single Unit', 'SINGLE-261', 'piece', 'piece', 1, 2, 4, 5, 2, 'purchasing');

insert into public.product_selling_units (business_id, product_id, unit, conversion_quantity, selling_price)
values
  ('10000000-0000-0000-0000-000000000261', '30000000-0000-0000-0000-000000000261', 'carton', 10, 300),
  ('10000000-0000-0000-0000-000000000261', '30000000-0000-0000-0000-000000000262', 'carton', 10, 500),
  ('10000000-0000-0000-0000-000000000261', '30000000-0000-0000-0000-000000000263', 'carton', 20, 200);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000261","role":"authenticated"}', true);

select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000261","quantity":"2.5","unit_price":"45"}]') $$, 'decimal base-unit sale succeeds');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000261'), 27.500::numeric, 'decimal kg sale deducts exact base quantity');
select is((select estimated_unit_cost_basis from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261' order by created_at limit 1), 30.0000::numeric, 'sales COGS uses base-unit cost');
select is((select inventory_quantity from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261'), 2.500::numeric, 'base-unit sale snapshots inventory quantity');
select is((select line_total from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261'), 112.5000::numeric, 'base-unit sale total uses sale quantity');

select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000261","quantity":"1","unit_price":"300","selling_unit":"carton"}]') $$, 'carton to kg sale succeeds');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000261'), 17.500::numeric, 'carton sale deducts ten kg');
select is((select quantity from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261' and selling_unit = 'carton'), 1.000::numeric, 'carton sale preserves selling quantity');
select is((select selling_conversion_quantity from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261' and selling_unit = 'carton'), 10.000::numeric, 'carton sale snapshots conversion');
select is((select inventory_quantity from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261' and selling_unit = 'carton'), 10.000::numeric, 'carton sale snapshots converted stock quantity');
select is((select line_total from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261' and selling_unit = 'carton'), 300.0000::numeric, 'carton total uses carton price');
select is((select estimated_unit_cost_basis from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261' and selling_unit = 'carton'), 30.0000::numeric, 'carton sale COGS remains per kg');

select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000262","quantity":"1","unit_price":"500","selling_unit":"carton"}]') $$, 'carton to piece sale succeeds');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000262'), 20.000::numeric, 'carton to piece deducts ten pieces');
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000263","quantity":"1","unit_price":"200","selling_unit":"carton"}]') $$, 'carton to pack sale succeeds');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000263'), 30.000::numeric, 'carton to pack deducts twenty packs');
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000264","quantity":"2","unit_price":"4"}]') $$, 'same-unit sale remains compatible');
select is((select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000264'), 3.000::numeric, 'same-unit sale deducts its entered quantity');

select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000261","quantity":"1","unit_price":"300","selling_unit":"crate"}]') $$, '42501', 'Selling unit is not configured for one or more products', 'unconfigured selling unit is rejected');
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000261","quantity":"2","unit_price":"600","selling_unit":"carton"}]') $$, '23514', 'Insufficient stock for one or more sale items', 'converted stock validation is enforced');
select throws_ok($$ select public.save_product_selling_units('30000000-0000-0000-0000-000000000261', '[{"unit":"bag","conversion_quantity":"0","selling_price":"1"}]') $$, '22023', 'Selling unit configuration is invalid', 'zero selling conversion is rejected');
select lives_ok($$ select public.save_product_selling_units('30000000-0000-0000-0000-000000000261', '[{"unit":"carton","conversion_quantity":"12","selling_price":"300"}]') $$, 'future selling conversion can change');
select is((select selling_conversion_quantity from public.sale_items where product_id = '30000000-0000-0000-0000-000000000261' and selling_unit = 'carton'), 10.000::numeric, 'historical sale retains original conversion');
select is((select current_quantity <= low_stock_threshold from public.products where id = '30000000-0000-0000-0000-000000000261'), true, 'low stock is evaluated in base units');
select lives_ok($$ select public.save_product_selling_units('30000000-0000-0000-0000-000000000261', '[{"unit":"carton","conversion_quantity":"1.333","selling_price":"300"}]') $$, 'fractional selling conversion can be configured');
select throws_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000261","quantity":"0.001","unit_price":"1","selling_unit":"carton"}]') $$, '22023', 'Converted inventory quantity supports at most three decimals', 'unsafe converted precision fails safely');

select * from finish();
rollback;
