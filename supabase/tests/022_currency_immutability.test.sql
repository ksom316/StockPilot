begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'currency-lock-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Currency Lock Owner"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000033', 'authenticated', 'authenticated', 'currency-lock-other@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Other User"}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}', true);
create temporary table currency_lock_businesses (sale_business uuid, purchase_business uuid, expense_business uuid, clean_business uuid);
insert into currency_lock_businesses
select
  public.create_business_onboarding('Sale Lock', 'Retail', array[]::public.optional_module[], 'store', 'USD'),
  public.create_additional_business('Purchase Lock', 'Retail', array[]::public.optional_module[], 'store', 'USD'),
  public.create_additional_business('Expense Lock', 'Retail', array[]::public.optional_module[], 'store', 'USD'),
  public.create_additional_business('Clean Business', 'Retail', array[]::public.optional_module[], 'store', 'USD');

select lives_ok($$ update public.businesses set currency = 'EUR' where id = (select clean_business from currency_lock_businesses) $$, 'owner can change currency before financial activity');
select lives_ok($$ insert into public.products (business_id, name, sku, cost_price, selling_price, low_stock_threshold) values ((select clean_business from currency_lock_businesses), 'Price Only Product', null, 10, 20, 0) $$, 'product prices alone do not count as financial activity');
select lives_ok($$ update public.businesses set currency = 'GBP' where id = (select clean_business from currency_lock_businesses) $$, 'currency remains changeable after product pricing only');

reset role;
insert into public.sales (business_id, sale_number, subtotal, total, created_by)
select sale_business, 1, 10, 10, '00000000-0000-0000-0000-000000000032' from currency_lock_businesses;
insert into public.purchases (business_id, purchase_number, request_id, subtotal, total, created_by)
select purchase_business, 1, '00000000-0000-0000-0000-000000000101', 10, 10, '00000000-0000-0000-0000-000000000032' from currency_lock_businesses;
insert into public.expense_categories (business_id, name)
select expense_business, 'Test expense' from currency_lock_businesses;
insert into public.expenses (business_id, category_id, category_name, amount, expense_date, description, created_by, updated_by)
select b.expense_business, c.id, c.name, 5, current_date, 'Recorded test expense', '00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000032'
from currency_lock_businesses b join public.expense_categories c on c.business_id = b.expense_business and c.name = 'Test expense';

set local role authenticated;
select throws_ok($$ update public.businesses set currency = 'GHS' where id = (select sale_business from currency_lock_businesses) $$, '55006', 'Business currency cannot be changed after financial activity has been recorded', 'recorded sales lock currency');
select throws_ok($$ update public.businesses set currency = 'GHS' where id = (select purchase_business from currency_lock_businesses) $$, '55006', 'Business currency cannot be changed after financial activity has been recorded', 'recorded purchases lock currency');
select throws_ok($$ update public.businesses set currency = 'GHS' where id = (select expense_business from currency_lock_businesses) $$, '55006', 'Business currency cannot be changed after financial activity has been recorded', 'recorded expenses lock currency');
select lives_ok($$ update public.businesses set name = 'Sale Lock Renamed' where id = (select sale_business from currency_lock_businesses) $$, 'unrelated business fields remain editable after currency lock');
select is((select currency from public.businesses where id = (select clean_business from currency_lock_businesses)), 'GBP', 'currency lock is scoped to the business with activity');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated"}', true);
select lives_ok($$ update public.businesses set currency = 'GHS' where id = (select sale_business from currency_lock_businesses) $$, 'unauthorized update is rejected by RLS without exposing the currency guard');
reset role;
select is((select currency from public.businesses where id = (select sale_business from currency_lock_businesses)), 'USD', 'unauthorized user cannot change another business currency');

select * from finish();
rollback;
