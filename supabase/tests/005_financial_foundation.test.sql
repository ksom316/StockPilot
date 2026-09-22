begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'finance-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Finance Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'finance-manager@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Finance Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'finance-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Finance Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000304', 'authenticated', 'authenticated', 'finance-cashier@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Finance Cashier"}', now(), now()),
  ('00000000-0000-0000-0000-000000000305', 'authenticated', 'authenticated', 'finance-owner-b@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Finance Owner B"}', now(), now());

insert into public.businesses (id, name, currency, owner_user_id)
values
  ('10000000-0000-0000-0000-000000000301', 'Finance Business A', 'USD', '00000000-0000-0000-0000-000000000301'),
  ('10000000-0000-0000-0000-000000000302', 'Finance Business B', 'USD', '00000000-0000-0000-0000-000000000305');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000302', 'manager', 'active'),
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000303', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000304', 'cashier', 'active');

update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000000301'
  and module in ('sales', 'purchasing', 'expenses');
update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000000302' and module = 'expenses';

update public.businesses set timezone = 'America/New_York'
where id = '10000000-0000-0000-0000-000000000301';

select is((select timezone from public.businesses where id = '10000000-0000-0000-0000-000000000302'), 'UTC', 'new businesses default to UTC');
select throws_ok(
  $$ update public.businesses set timezone = 'Not/A_Timezone' where id = '10000000-0000-0000-0000-000000000301' $$,
  '22023', 'Business timezone must be a valid IANA timezone name',
  'invalid business timezones are rejected'
);
select is((select count(*) from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and is_system), 8::bigint, 'existing business receives eight default expense categories');
select is((select count(*) from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000302' and is_system), 8::bigint, 'new business bootstrap creates default expense categories');

insert into public.categories (id, business_id, name)
values ('20000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000301', 'Tracked Category');

-- Inserts outside an authenticated browser context model legacy/imported rows: cost remains unknown.
insert into public.products (id, business_id, category_id, name, sku, cost_price, selling_price)
values
  ('30000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000301', null, 'Legacy Product', 'FIN-LEGACY', 9.0000, 5.0000),
  ('30000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000301', 'Known Zero Product', 'FIN-ZERO', 1.0000, 10.0000),
  ('30000000-0000-0000-0000-000000000303', '10000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000301', 'Purchased Product', 'FIN-PURCHASED', 2.0000, 10.0000),
  ('30000000-0000-0000-0000-000000000304', '10000000-0000-0000-0000-000000000301', null, 'Unknown Product', 'FIN-UNKNOWN', 0.0000, 20.0000);

select is((select cost_source::text from public.products where id = '30000000-0000-0000-0000-000000000301'), 'unknown', 'legacy nonzero product cost remains unknown');
select is((select cost_source::text from public.products where id = '30000000-0000-0000-0000-000000000304'), 'unknown', 'unknown zero cost is explicitly unknown');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok(
  $$ update public.products set cost_price = 0 where id = '30000000-0000-0000-0000-000000000302' $$,
  'owner can deliberately edit a product to a known zero manual cost'
);
reset role;

select is((select cost_price from public.products where id = '30000000-0000-0000-0000-000000000302'), 0.0000::numeric, 'known zero stores an exact zero cost');
select is((select cost_source::text from public.products where id = '30000000-0000-0000-0000-000000000302'), 'manual', 'known zero is distinguished by manual provenance');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok(
  $$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000303","quantity":"10","unit_cost":"4"}]', '40000000-0000-0000-0000-000000000301') $$,
  'Purchasing receipt establishes a known product cost'
);
select lives_ok($$ select public.record_inventory_movement('30000000-0000-0000-0000-000000000302', 'stock_in', 10, 'Finance test stock') $$, 'manual stock supports the known-zero sale');
select lives_ok($$ select public.record_inventory_movement('30000000-0000-0000-0000-000000000304', 'stock_in', 10, 'Finance test stock') $$, 'manual stock supports the unknown-cost sale');
reset role;

select is((select cost_price from public.products where id = '30000000-0000-0000-0000-000000000303'), 4.0000::numeric, 'receipt stores latest/default received cost');
select is((select cost_source::text from public.products where id = '30000000-0000-0000-0000-000000000303'), 'purchasing', 'receipt sets Purchasing provenance');

-- A pre-6A-style historical line deliberately has no estimated cost snapshot.
insert into public.sales (id, business_id, sale_number, sold_at, subtotal, total, created_by)
values ('50000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000301', 90, '2026-01-09 17:00:00+00', 5, 5, '00000000-0000-0000-0000-000000000301');
insert into public.sale_items (business_id, sale_id, product_id, product_name, product_sku, quantity, unit_price, line_total)
values ('10000000-0000-0000-0000-000000000301', '50000000-0000-0000-0000-000000000301', '30000000-0000-0000-0000-000000000301', 'Legacy Product', 'FIN-LEGACY', 1, 5, 5);
select is((select estimated_unit_cost_basis from public.sale_items where sale_id = '50000000-0000-0000-0000-000000000301'), null::numeric, 'historical sale item remains cost-basis unavailable');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000302","quantity":"2","unit_price":"10"}]') $$, 'known-zero product sale succeeds');
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000303","quantity":"3","unit_price":"10"}]') $$, 'Purchasing-cost product sale succeeds');
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000304","quantity":"1","unit_price":"20"}]') $$, 'unknown-cost product sale succeeds without fabricating cost');
reset role;

update public.sales set sold_at = '2026-01-11 04:30:00+00' where sale_number = 91;
update public.sales set sold_at = '2026-01-11 05:30:00+00' where sale_number = 92;
update public.sales set sold_at = '2026-01-12 05:30:00+00' where sale_number = 93;
update public.purchases set received_at = '2026-01-11 17:00:00+00' where request_id = '40000000-0000-0000-0000-000000000301';

select is((select estimated_unit_cost_basis from public.sale_items where product_id = '30000000-0000-0000-0000-000000000302'), 0.0000::numeric, 'known zero snapshots as zero, not NULL');
select is((select estimated_cost_source::text from public.sale_items where product_id = '30000000-0000-0000-0000-000000000302'), 'manual', 'manual cost provenance is snapshotted');
select is((select estimated_unit_cost_basis from public.sale_items where product_id = '30000000-0000-0000-0000-000000000303'), 4.0000::numeric, 'received cost snapshots at sale time');
select is((select estimated_cost_source::text from public.sale_items where product_id = '30000000-0000-0000-0000-000000000303'), 'purchasing', 'Purchasing provenance is snapshotted');
select is((select estimated_unit_cost_basis from public.sale_items where product_id = '30000000-0000-0000-0000-000000000304'), null::numeric, 'unknown future cost snapshots as NULL');
select is((select estimated_cost_source from public.sale_items where product_id = '30000000-0000-0000-0000-000000000304'), null::public.product_cost_source, 'unknown future provenance remains NULL');
select is((select product_category_name from public.sale_items where product_id = '30000000-0000-0000-0000-000000000303'), 'Tracked Category', 'future sale item snapshots product category name');

update public.products set cost_price = 8 where id = '30000000-0000-0000-0000-000000000303';
select is((select estimated_unit_cost_basis from public.sale_items where product_id = '30000000-0000-0000-0000-000000000303'), 4.0000::numeric, 'later product cost change cannot rewrite sale history');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select lives_ok($$ insert into public.expense_categories (business_id, name) values ('10000000-0000-0000-0000-000000000301', 'Licensing') $$, 'owner can create a custom category');
select lives_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Rent'), 10, '2026-01-11', 'Owner active expense') $$, 'owner can create an expense');
select lives_ok($$ select public.update_expense((select id from public.expenses where description = 'Owner active expense'), (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Rent'), 12, '2026-01-11', 'Owner active expense', 'Corrected amount') $$, 'owner can edit a non-void expense');
select lives_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Licensing'), 2, '2026-01-11', 'Owner void expense') $$, 'owner can create an expense to correct');
select lives_ok($$ select public.void_expense((select id from public.expenses where description = 'Owner void expense'), 'Duplicate entry') $$, 'owner can void with a reason');
reset role;

select is((select category_name from public.expenses where description = 'Owner void expense'), 'Licensing', 'expense snapshots its category name');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
select lives_ok($$ update public.expense_categories set name = 'Subscriptions' where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Licensing' $$, 'manager can rename a custom category');
reset role;
select is((select category_name from public.expenses where description = 'Owner void expense'), 'Licensing', 'later category rename preserves historical category meaning');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
select lives_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Utilities'), 4, '2026-01-11', 'Manager active expense') $$, 'manager can create an expense');
select lives_ok($$ select public.update_expense((select id from public.expenses where description = 'Manager active expense'), (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Utilities'), 5, '2026-01-11', 'Manager active expense') $$, 'manager can edit an expense');
select lives_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Transport'), 3, '2026-01-11', 'Manager void expense') $$, 'manager can create a correction candidate');
select lives_ok($$ select public.update_expense((select id from public.expenses where description = 'Manager void expense'), (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Transport'), 3.5, '2026-01-11', 'Manager void expense') $$, 'manager can edit a correction candidate');
select throws_ok($$ select public.void_expense((select id from public.expenses where description = 'Manager void expense'), ' ') $$, '22023', 'Void reason must be between 1 and 1000 characters', 'void requires a meaningful reason');
select lives_ok($$ select public.void_expense((select id from public.expenses where description = 'Manager void expense'), 'Entered twice') $$, 'manager can void an expense');
select throws_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' limit 1), 0, '2026-01-11', 'Invalid amount') $$, '22023', 'Expense amount must be positive with at most four decimals', 'nonpositive expense amount is rejected');
select throws_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000302' limit 1), 1, '2026-01-11', 'Wrong tenant category') $$, '42501', 'Expense category is unavailable', 'cross-tenant category is rejected');
select throws_like($$ insert into public.expense_audit (business_id, expense_id, action, actor_user_id, after_data) values ('10000000-0000-0000-0000-000000000301', (select id from public.expenses limit 1), 'created', '00000000-0000-0000-0000-000000000302', '{}') $$, '%permission denied%', 'client cannot forge audit rows');
select throws_like($$ delete from public.expenses where description = 'Manager active expense' $$, '%permission denied%', 'client cannot hard-delete expenses');
select lives_ok($$ update public.expense_categories set is_active = false where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Subscriptions' $$, 'manager can deactivate a custom category');
select throws_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', (select id from public.expense_categories where business_id = '10000000-0000-0000-0000-000000000301' and name = 'Subscriptions'), 1, '2026-01-11', 'Inactive category attempt') $$, '42501', 'Expense category is unavailable', 'deactivated category cannot be used for a new expense');
reset role;

select ok((select voided from public.expenses where description = 'Owner void expense'), 'deactivation preserves expense history that references the category');
select is((select count(*) from public.expense_audit where action = 'created'), 4::bigint, 'create actions are audited');
select is((select count(*) from public.expense_audit where action = 'updated'), 3::bigint, 'edit actions are audited');
select is((select count(*) from public.expense_audit where action = 'voided'), 2::bigint, 'void actions are audited');
select is((select actor_user_id from public.expense_audit where action = 'created' and after_data ->> 'description' = 'Owner active expense'), '00000000-0000-0000-0000-000000000301'::uuid, 'audit derives the owner actor from auth.uid');
select is((select actor_user_id from public.expense_audit where action = 'voided' and after_data ->> 'description' = 'Manager void expense'), '00000000-0000-0000-0000-000000000302'::uuid, 'audit derives the manager actor from auth.uid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000303","role":"authenticated"}', true);
select is((select count(*) from public.expenses), 0::bigint, 'employee cannot read Finance expenses');
select throws_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000000', 1, '2026-01-11', 'Employee attempt') $$, '42501', 'Finance access is required', 'employee cannot create expenses');
select throws_ok($$ select * from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11') $$, '42501', 'Finance access is required', 'employee cannot view profitability');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000304","role":"authenticated"}', true);
select is((select count(*) from public.expense_categories), 0::bigint, 'cashier cannot read Finance categories');
select throws_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000000', 1, '2026-01-11', 'Cashier attempt') $$, '42501', 'Finance access is required', 'cashier cannot create expenses');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000305","role":"authenticated"}', true);
select is((select count(*) from public.expenses where business_id = '10000000-0000-0000-0000-000000000301'), 0::bigint, 'other tenant cannot read Finance data');
select throws_ok($$ select * from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11') $$, '42501', 'Finance access is required', 'other tenant cannot query summary');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select is((select recorded_sales from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-10', '2026-01-10')), 20.0000::numeric, 'business timezone places 04:30 UTC sale on prior local date');
select is((select estimated_product_cost from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-10', '2026-01-10')), 0.0000::numeric, 'known zero cost is complete and exact');
select ok((select cost_coverage_complete from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-10', '2026-01-10')), 'known zero counts as complete cost coverage');
select is((select recorded_sales from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), 30.0000::numeric, 'next UTC sale falls on January 11 business-local date');
select is((select estimated_product_cost from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), 12.0000::numeric, 'estimated product cost uses exact rounded quantity times snapshot cost');
select is((select estimated_gross_profit from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), 18.0000::numeric, 'estimated gross profit is exact when coverage is complete');
select is((select estimated_gross_margin from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), 60.000000::numeric, 'estimated gross margin is exact and decimal');
select is((select operating_expenses from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), 17.0000::numeric, 'summary includes edited active expenses and excludes voided expenses');
select is((select estimated_net_profit from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), 1.0000::numeric, 'estimated net profit subtracts operating expenses, not purchases');
select is((select purchase_receipts from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), 40.0000::numeric, 'purchase receipts are returned separately');
select is((select missing_cost_sale_item_count from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-10', '2026-01-12')), 1::bigint, 'unknown cost coverage is disclosed');
select is((select estimated_gross_profit from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-10', '2026-01-12')), null::numeric, 'incomplete coverage cannot produce misleading gross profit');
select is((select estimated_net_profit from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-10', '2026-01-12')), null::numeric, 'incomplete coverage cannot produce misleading net profit');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}', true);
select is((select recorded_sales from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), 30.0000::numeric, 'manager can view canonical Finance summary');
reset role;

update public.business_modules set enabled = false where business_id = '10000000-0000-0000-0000-000000000301' and module = 'purchasing';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select is((select purchase_receipts from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11')), null::numeric, 'Finance does not leak purchase totals while Purchasing is disabled');
reset role;

update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000000301' and module = 'purchasing';
update public.business_modules set enabled = false where business_id = '10000000-0000-0000-0000-000000000301' and module = 'expenses';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select is((select count(*) from public.expenses), 0::bigint, 'disabled Expenses module hides preserved data');
select throws_ok($$ select * from public.get_financial_summary('10000000-0000-0000-0000-000000000301', '2026-01-11', '2026-01-11') $$, '42501', 'Finance access is required', 'disabled Expenses module blocks summary');
select throws_ok($$ select public.create_expense('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000000', 1, '2026-01-11', 'Disabled attempt') $$, '42501', 'Finance access is required', 'disabled Expenses module blocks mutations');
select lives_ok($$ select public.record_sale('[{"product_id":"30000000-0000-0000-0000-000000000302","quantity":"1","unit_price":"10"}]') $$, 'Sales continues independently while Finance is disabled');
select lives_ok($$ select public.record_inventory_movement('30000000-0000-0000-0000-000000000302', 'stock_in', 1, 'Finance disabled inventory check') $$, 'Inventory continues independently while Finance is disabled');
select lives_ok($$ select public.record_purchase('[{"product_id":"30000000-0000-0000-0000-000000000303","quantity":"1","unit_cost":"6"}]', '40000000-0000-0000-0000-000000000302') $$, 'Purchasing continues independently while Finance is disabled');
reset role;

update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000000301' and module = 'expenses';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select is((select count(*) from public.expenses), 4::bigint, 're-enabling Finance restores historical expense access');
reset role;

select * from finish();
rollback;
