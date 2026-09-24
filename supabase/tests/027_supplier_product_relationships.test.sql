begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'relationship-owner@stockpilot.test', '', now(), '{}', '{"display_name":"Relationship Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'relationship-employee@stockpilot.test', '', now(), '{}', '{"display_name":"Relationship Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'relationship-other@stockpilot.test', '', now(), '{}', '{"display_name":"Other Owner"}', now(), now());
insert into public.businesses (id, name, owner_user_id) values
  ('10000000-0000-0000-0000-000000000301', 'Relationship Business', '00000000-0000-0000-0000-000000000301'),
  ('10000000-0000-0000-0000-000000000302', 'Other Relationship Business', '00000000-0000-0000-0000-000000000303');
insert into public.business_members (business_id, user_id, role, status) values
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000302', 'employee', 'active');
update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000000301' and module = 'purchasing';
insert into public.suppliers (id, business_id, name) values
  ('20000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000301', 'Tema Frozen Foods'),
  ('20000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000301', 'Prime Frozen Distributors'),
  ('20000000-0000-0000-0000-000000000303', '10000000-0000-0000-0000-000000000302', 'Other Business Supplier');
insert into public.products (id, business_id, name, sku) values
  ('30000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000301', 'Chicken Wings', 'REL-WINGS'),
  ('30000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000301', 'Chicken Drumsticks', 'REL-DRUM'),
  ('30000000-0000-0000-0000-000000000303', '10000000-0000-0000-0000-000000000302', 'Other Product', 'REL-OTHER');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok($$ insert into public.supplier_products (business_id, supplier_id, product_id) values ('10000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000301', '30000000-0000-0000-0000-000000000301'), ('10000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000301', '30000000-0000-0000-0000-000000000302'), ('10000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000302', '30000000-0000-0000-0000-000000000301') $$, 'one supplier can link multiple products and one product can link multiple suppliers');
select is((select count(*) from public.supplier_products where supplier_id = '20000000-0000-0000-0000-000000000301'), 2::bigint, 'supplier has multiple products');
select is((select count(*) from public.supplier_products where product_id = '30000000-0000-0000-0000-000000000301'), 2::bigint, 'product has multiple suppliers');
select is((select count(*) from public.supplier_products where product_id = '30000000-0000-0000-0000-000000000302'), 1::bigint, 'linked product is readable');
select lives_ok($$ update public.supplier_products set is_preferred = true where supplier_id = '20000000-0000-0000-0000-000000000301' and product_id = '30000000-0000-0000-0000-000000000301' $$, 'preferred supplier can be set');
select throws_ok($$ update public.supplier_products set is_preferred = true where supplier_id = '20000000-0000-0000-0000-000000000302' and product_id = '30000000-0000-0000-0000-000000000301' $$, '23505', null, 'only one preferred supplier is allowed');
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000301","quantity":"1","unit_cost":"10"}]', '40000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000301') $$, 'purchasing remains possible for a linked supplier');
select lives_ok($$ delete from public.supplier_products where supplier_id = '20000000-0000-0000-0000-000000000301' and product_id = '30000000-0000-0000-0000-000000000302' $$, 'non-preferred link can be unlinked');
select lives_ok($$ delete from public.supplier_products where supplier_id = '20000000-0000-0000-0000-000000000301' and product_id = '30000000-0000-0000-0000-000000000301' $$, 'preferred link can be unlinked without choosing another');
select is((select count(*) from public.supplier_products where product_id = '30000000-0000-0000-0000-000000000301' and is_preferred), 0::bigint, 'unlinking preferred leaves no preferred supplier');
select is((select count(*) from public.purchases where request_id = '40000000-0000-0000-0000-000000000301' and supplier_name = 'Tema Frozen Foods'), 1::bigint, 'unlinking does not affect historical purchase supplier snapshot');
select is((select count(*) from public.supplier_products where supplier_id = '20000000-0000-0000-0000-000000000301'), 0::bigint, 'supplier can have no products');
select is((select count(*) from public.supplier_products where product_id = '30000000-0000-0000-0000-000000000302'), 0::bigint, 'product can have no suppliers');
select throws_ok($$ insert into public.supplier_products (business_id, supplier_id, product_id) values ('10000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000303', '30000000-0000-0000-0000-000000000301') $$, '23503', null, 'cross-business supplier is rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
select is((select count(*) from public.supplier_products), 1::bigint, 'employee can read current relationships');
select is_empty($$ delete from public.supplier_products returning id $$, 'employee cannot mutate relationships');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000303","role":"authenticated"}', true);
select is((select count(*) from public.supplier_products where business_id = '10000000-0000-0000-0000-000000000301'), 0::bigint, 'other business cannot read relationships');
reset role;
select * from finish();
rollback;
