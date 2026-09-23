begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'currency@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Currency Owner"}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}', true);
select lives_ok($$ select public.create_business_onboarding('Cedi Workspace', 'Retail', array[]::public.optional_module[], 'store', 'GHS') $$, 'onboarding accepts a supported business currency');
select is((select currency from public.businesses where name = 'Cedi Workspace'), 'GHS', 'currency is stored on the business');
select lives_ok($$ insert into public.products (business_id, name, sku, cost_price, selling_price, low_stock_threshold) values ((select id from public.businesses where name = 'Cedi Workspace'), 'No Code Item', null, 1, 2, 0) $$, 'an owner can create a product without a SKU');
select is((select sku from public.products where name = 'No Code Item'), null, 'optional SKU remains null');
select lives_ok($$ update public.businesses set currency = 'EUR' where name = 'Cedi Workspace' $$, 'the owner can change the business currency');
select is((select currency from public.businesses where name = 'Cedi Workspace'), 'EUR', 'currency changes are business-scoped');
select throws_ok($$ select public.create_additional_business('Bad Currency', 'Retail', array[]::public.optional_module[], 'store', 'JPY') $$, '22023', 'Business currency is not supported', 'unsupported currencies are rejected');

select * from finish();
rollback;
