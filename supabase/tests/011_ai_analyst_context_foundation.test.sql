begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000001001', 'authenticated', 'authenticated', 'analyst-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Analyst Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000001002', 'authenticated', 'authenticated', 'analyst-manager@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Analyst Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000001003', 'authenticated', 'authenticated', 'analyst-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Analyst Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000001004', 'authenticated', 'authenticated', 'analyst-cashier@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Analyst Cashier"}', now(), now()),
  ('00000000-0000-0000-0000-000000001005', 'authenticated', 'authenticated', 'analyst-inactive@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Analyst Inactive"}', now(), now()),
  ('00000000-0000-0000-0000-000000001006', 'authenticated', 'authenticated', 'analyst-outsider@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Analyst Outsider"}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values
  ('10000000-0000-0000-0000-000000001001', 'Analyst Business A', 'USD', 'America/New_York', '00000000-0000-0000-0000-000000001001'),
  ('10000000-0000-0000-0000-000000001002', 'Analyst Business B', 'EUR', 'UTC', '00000000-0000-0000-0000-000000001006');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001002', 'manager', 'active'),
  ('10000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001003', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001004', 'cashier', 'active'),
  ('10000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001005', 'manager', 'inactive');

select ok(
  'ai_analyst' = any(enum_range(null::public.optional_module)::text[]),
  'AI Analyst is a distinct optional module'
);
select is(
  (select enabled from public.business_modules where business_id = '10000000-0000-0000-0000-000000001001' and module = 'ai_analyst'),
  false,
  'new businesses receive an explicit disabled AI Analyst row'
);
select is(
  (select count(*) from public.business_modules where module = 'ai_analyst'),
  (select count(*) from public.businesses),
  'every existing business has an AI Analyst module row'
);

update public.business_modules
set enabled = true
where business_id = '10000000-0000-0000-0000-000000001001'
  and module in ('ai_analyst', 'sales', 'purchasing', 'expenses', 'smart_insights', 'customers');

insert into public.products (
  id, business_id, name, sku, description, current_quantity,
  low_stock_threshold, is_active, created_at
)
select
  md5('ai-product-' || series)::uuid,
  '10000000-0000-0000-0000-000000001001',
  'Product ' || lpad(series::text, 2, '0'),
  'AI-' || lpad(series::text, 2, '0'),
  case when series = 1 then 'PRODUCT_PRIVATE_DESCRIPTION' else null end,
  case when series <= 12 then 0.000 when series <= 24 then 1.125 else 9.500 end,
  case when series <= 24 then 2.000 else 1.000 end,
  true,
  (((statement_timestamp() at time zone 'America/New_York')::date - 60)::timestamp at time zone 'America/New_York')
from generate_series(1, 26) as series;

insert into public.sales (
  id, business_id, sale_number, sold_at, subtotal, total, notes, created_by
)
values (
  '50000000-0000-0000-0000-000000001001',
  '10000000-0000-0000-0000-000000001001',
  1,
  ((statement_timestamp() at time zone 'America/New_York')::date::timestamp + interval '12 hours') at time zone 'America/New_York',
  10.0001,
  10.0001,
  'PRIVATE_SALE_NOTE',
  '00000000-0000-0000-0000-000000001001'
);

insert into public.sale_items (
  business_id, sale_id, product_id, product_name, product_sku, quantity,
  unit_price, line_total, estimated_unit_cost_basis, estimated_cost_source
)
values (
  '10000000-0000-0000-0000-000000001001',
  '50000000-0000-0000-0000-000000001001',
  md5('ai-product-1')::uuid,
  'Product 01',
  'AI-01',
  1.125,
  8.8890,
  10.0001,
  2.0000,
  'manual'
);

insert into public.suppliers (
  id, business_id, name, contact_name, phone, email, notes
)
values (
  '40000000-0000-0000-0000-000000001001',
  '10000000-0000-0000-0000-000000001001',
  'PRIVATE_SUPPLIER_NAME',
  'PRIVATE_SUPPLIER_CONTACT',
  '+1-555-PRIVATE',
  'private-supplier@example.test',
  'PRIVATE_SUPPLIER_NOTE'
);

insert into public.purchases (
  id, business_id, purchase_number, request_id, supplier_id, supplier_name,
  received_at, subtotal, total, notes, created_by
)
values (
  '60000000-0000-0000-0000-000000001001',
  '10000000-0000-0000-0000-000000001001',
  1,
  '90000000-0000-0000-0000-000000001001',
  '40000000-0000-0000-0000-000000001001',
  'PRIVATE_SUPPLIER_NAME',
  ((statement_timestamp() at time zone 'America/New_York')::date::timestamp + interval '13 hours') at time zone 'America/New_York',
  3.3330,
  3.3330,
  'PRIVATE_PURCHASE_NOTE',
  '00000000-0000-0000-0000-000000001001'
);

insert into public.purchase_items (
  business_id, purchase_id, product_id, product_name, product_sku,
  quantity, unit_cost, line_total
)
values (
  '10000000-0000-0000-0000-000000001001',
  '60000000-0000-0000-0000-000000001001',
  md5('ai-product-1')::uuid,
  'Product 01',
  'AI-01',
  1.111,
  3.0000,
  3.3330
);

insert into public.expenses (
  id, business_id, category_id, category_name, amount, expense_date,
  description, notes, created_by, updated_by
)
select
  '80000000-0000-0000-0000-000000001001',
  '10000000-0000-0000-0000-000000001001',
  category.id,
  category.name,
  1.0001,
  (statement_timestamp() at time zone 'America/New_York')::date,
  'PRIVATE_EXPENSE_DESCRIPTION',
  'PRIVATE_EXPENSE_NOTE',
  '00000000-0000-0000-0000-000000001001',
  '00000000-0000-0000-0000-000000001001'
from public.expense_categories as category
where category.business_id = '10000000-0000-0000-0000-000000001001'
order by category.name
limit 1;

insert into public.customers (business_id, name, phone, email, note)
values (
  '10000000-0000-0000-0000-000000001001',
  'PRIVATE_CUSTOMER_NAME',
  '+1-555-CUSTOMER',
  'private-customer@example.test',
  'PRIVATE_CUSTOMER_NOTE'
);

-- The Data API grant itself rejects anonymous callers.
set local role anon;
select throws_like(
  $$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY') $$,
  '%permission denied%',
  'anonymous callers cannot execute AI Analyst context'
);
reset role;

-- Owner receives the complete, bounded deterministic contract.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001001","role":"authenticated"}', true);
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->>'schemaVersion', '1', 'context contract is versioned');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'period'->>'timezone', 'America/New_York', 'context uses the business timezone');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'period'->>'startDate', (statement_timestamp() at time zone 'America/New_York')::date::text, 'TODAY starts on the current business-local date');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'period'->>'endDate', (statement_timestamp() at time zone 'America/New_York')::date::text, 'TODAY ends on the current business-local date');
select is(
  public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'THIS_WEEK')->'period'->>'startDate',
  ((statement_timestamp() at time zone 'America/New_York')::date - (extract(isodow from (statement_timestamp() at time zone 'America/New_York')::date)::integer - 1))::text,
  'THIS_WEEK starts Monday in the business timezone'
);
select is(
  public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'THIS_WEEK')->'period'->>'endDate',
  ((statement_timestamp() at time zone 'America/New_York')::date - (extract(isodow from (statement_timestamp() at time zone 'America/New_York')::date)::integer - 1) + 6)::text,
  'THIS_WEEK ends Sunday in the business timezone'
);
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'THIS_MONTH')->'period'->>'startDate', date_trunc('month', statement_timestamp() at time zone 'America/New_York')::date::text, 'THIS_MONTH starts on the first local date');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'LAST_30_COMPLETED_DAYS')->'period'->>'startDate', ((statement_timestamp() at time zone 'America/New_York')::date - 30)::text, 'completed window starts thirty local dates before today');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'LAST_30_COMPLETED_DAYS')->'period'->>'endDate', ((statement_timestamp() at time zone 'America/New_York')::date - 1)::text, 'completed window excludes the current partial local date');
select throws_ok(
  $$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'CUSTOM') $$,
  '22023', 'Unsupported AI Analyst period', 'arbitrary periods are rejected'
);

select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'inventory'->'currentState'->>'active_products', '26', 'inventory aggregates remain catalog-wide');
select is(jsonb_array_length(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'inventory'->'attention'->'products'), 20, 'inventory attention detail is capped at twenty products');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'inventory'->'attention'->>'totalProducts', '24', 'truncation does not alter the authoritative attention count');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'inventory'->'attention'->'products'->0->>'stockState', 'OUT_OF_STOCK', 'out-of-stock products sort before low-stock products');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'inventory'->'attention'->'products'->0->>'currentQuantity', '0.000', 'exact inventory quantity is serialized as text');

select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'sales'->>'availability', 'AVAILABLE', 'enabled Sales context is available');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'sales'->'facts'->>'recorded_sales', '10.0001', 'Recorded Sales remains an exact decimal string');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'sales'->'facts'->>'units_sold', '1.125', 'fractional Units Sold remains exact');
select cmp_ok(jsonb_array_length(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'THIS_MONTH')->'sales'->'facts'->'daily_trend'), '<=', 31, 'daily trend never exceeds thirty-one points');
select cmp_ok(jsonb_array_length(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'sales'->'facts'->'top_products_by_units_sold'), '<=', 5, 'Sales top products remain bounded to five');
select ok(not (public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'sales'->'facts'->'top_products_by_units_sold'->0 ? 'product_id'), 'internal product IDs are removed from Sales detail');

select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'purchasing'->>'availability', 'AVAILABLE', 'enabled Purchasing context is available');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'purchasing'->'facts'->>'purchase_receipts', '3.3330', 'Purchase Receipts remain exact aggregate strings');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'purchasing'->'facts'->>'quantity_received', '1.111', 'received quantity remains exact');

select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'finance'->>'availability', 'AVAILABLE', 'enabled Finance context is available to owner');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'finance'->'facts'->>'estimatedProductCost', '2.2500', 'Estimated Product Cost remains exact');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'finance'->'facts'->>'operatingExpenses', '1.0001', 'Operating Expenses remain exact');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'finance'->'facts'->>'estimatedNetProfit', '6.7500', 'Estimated Net Profit remains exact');

select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'smartInventory'->>'availability', 'AVAILABLE', 'Smart Inventory context is module-aware');
select is(jsonb_array_length(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'smartInventory'->'products'), 15, 'Smart Inventory detail is capped at fifteen products');
select ok(not (public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'smartInventory'->'products'->0 ? 'product_id'), 'internal product IDs are removed from Smart Inventory detail');

select ok(not (public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY') ? 'customers'), 'Customers is absent even when its module is enabled');
select ok(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')::text not like '%PRIVATE_CUSTOMER%', 'customer names and notes are excluded');
select ok(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')::text not like '%private-customer@example.test%', 'customer contact data is excluded');
select ok(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')::text not like '%PRIVATE_SUPPLIER%', 'supplier names, contacts, and notes are excluded');
select ok(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')::text not like '%PRIVATE_EXPENSE%', 'expense descriptions and notes are excluded');
select ok(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')::text not like '%PRODUCT_PRIVATE_DESCRIPTION%', 'product descriptions are excluded');
select ok(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')::text not like '%PRIVATE_SALE_NOTE%', 'Sales notes are excluded');
reset role;

update public.sale_items
set estimated_unit_cost_basis = null,
    estimated_cost_source = null
where sale_id = '50000000-0000-0000-0000-000000001001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001001","role":"authenticated"}', true);
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'finance'->'facts'->>'costCoverageComplete', 'false', 'incomplete cost coverage remains explicit');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'finance'->'facts'->>'estimatedProductCost', null, 'unavailable Estimated Product Cost remains null rather than zero');
select ok(
  public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'limitations'
    @> '[{"code":"FINANCE_COST_COVERAGE_INCOMPLETE","context":"finance"}]'::jsonb,
  'incomplete Finance evidence has a machine-readable limitation'
);
reset role;

-- Manager is allowed; employee, cashier, inactive member, and outsiders are denied.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001002","role":"authenticated"}', true);
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->>'schemaVersion', '1', 'manager can request AI Analyst context');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001003","role":"authenticated"}', true);
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY') $$, '42501', 'AI Analyst access is required', 'employee is denied');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001004","role":"authenticated"}', true);
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY') $$, '42501', 'AI Analyst access is required', 'cashier is denied');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001005","role":"authenticated"}', true);
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY') $$, '42501', 'Business is unavailable', 'inactive member is denied');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001006","role":"authenticated"}', true);
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY') $$, '42501', 'Business is unavailable', 'cross-tenant access is denied');
select throws_ok($$ select public.get_ai_analyst_context('10000000-0000-0000-0000-000000001002', 'TODAY') $$, '42501', 'AI Analyst is not enabled for this business', 'disabled AI Analyst rejects its own owner');
reset role;

-- Disabled modules remain unavailable rather than becoming fake zeroes.
update public.business_modules
set enabled = false
where business_id = '10000000-0000-0000-0000-000000001001'
  and module in ('sales', 'purchasing', 'expenses', 'smart_insights');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001001","role":"authenticated"}', true);
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'sales'->>'availability', 'MODULE_DISABLED', 'disabled Sales is explicitly unavailable');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'sales'->>'facts', null, 'disabled Sales does not return fake zero facts');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'purchasing'->>'availability', 'MODULE_DISABLED', 'disabled Purchasing is explicitly unavailable');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'finance'->>'availability', 'MODULE_DISABLED', 'disabled Expenses makes Finance unavailable');
select is(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'smartInventory'->>'availability', 'MODULE_DISABLED', 'disabled Smart Inventory is explicitly unavailable');
select cmp_ok(jsonb_array_length(public.get_ai_analyst_context('10000000-0000-0000-0000-000000001001', 'TODAY')->'limitations'), '>=', 4, 'machine-readable limitations identify unavailable module context');
reset role;

select * from finish();
rollback;
