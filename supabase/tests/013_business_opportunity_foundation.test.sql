begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001301', 'authenticated', 'authenticated', 'opportunity-owner@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001302', 'authenticated', 'authenticated', 'opportunity-manager@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001303', 'authenticated', 'authenticated', 'opportunity-employee@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001304', 'authenticated', 'authenticated', 'opportunity-cashier@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001305', 'authenticated', 'authenticated', 'opportunity-inactive@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001306', 'authenticated', 'authenticated', 'opportunity-other@stockpilot.test', '', now(), '{}', '{}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values
  ('10000000-0000-0000-0000-000000001301', 'Opportunity Business', 'USD', 'America/New_York', '00000000-0000-0000-0000-000000001301'),
  ('10000000-0000-0000-0000-000000001302', 'Other Opportunity Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001306'),
  ('10000000-0000-0000-0000-000000001303', 'Inventory Only Business', 'USD', 'America/New_York', '00000000-0000-0000-0000-000000001301');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000001302', 'manager', 'active'),
  ('10000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000001303', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000001304', 'cashier', 'active'),
  ('10000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000001305', 'manager', 'inactive');

update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000001301'
  and module in ('sales', 'purchasing', 'expenses', 'smart_insights');
update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000001303'
  and module = 'smart_insights';

-- Test-fixture timestamps model modules with established observable history.
alter table public.business_modules disable trigger business_modules_set_updated_at;
update public.business_modules
set updated_at = (((current_timestamp at time zone 'America/New_York')::date - 90)::timestamp at time zone 'America/New_York')
where business_id = '10000000-0000-0000-0000-000000001301'
  and module in ('sales', 'purchasing');
alter table public.business_modules enable trigger business_modules_set_updated_at;

insert into public.products (id, business_id, name, sku, current_quantity, low_stock_threshold, cost_price, selling_price, created_at)
values
  ('30000000-0000-0000-0000-000000001301', '10000000-0000-0000-0000-000000001301', 'Restock Item', 'OPP-R', 0.000, 2.000, 2.0000, 5.0000, (((current_timestamp at time zone 'America/New_York')::date - 90)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000001302', '10000000-0000-0000-0000-000000001301', 'Slow Item', 'OPP-S', 10.500, 2.000, 1.0000, 3.0000, (((current_timestamp at time zone 'America/New_York')::date - 90)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000001303', '10000000-0000-0000-0000-000000001301', 'Margin Item', 'OPP-M', 8.000, 2.000, 9.0000, 10.0000, (((current_timestamp at time zone 'America/New_York')::date - 90)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000001304', '10000000-0000-0000-0000-000000001301', 'Repeat Item', 'OPP-P', 1.000, 2.000, 2.0000, 5.0000, (((current_timestamp at time zone 'America/New_York')::date - 90)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000001305', '10000000-0000-0000-0000-000000001301', 'New Item', 'OPP-N', 20.000, 2.000, 1.0000, 3.0000, (((current_timestamp at time zone 'America/New_York')::date - 5)::timestamp + interval '12 hours') at time zone 'America/New_York'),
  ('30000000-0000-0000-0000-000000001306', '10000000-0000-0000-0000-000000001302', 'Other Tenant Secret', 'OTHER', 99.000, 1.000, 1.0000, 3.0000, now() - interval '90 days'),
  ('30000000-0000-0000-0000-000000001307', '10000000-0000-0000-0000-000000001303', 'Inventory Only Item', 'INV', 4.000, 1.000, 1.0000, 3.0000, now() - interval '90 days');

-- Restock Item: prior quantity 2, recent quantity 6 over three completed dates.
-- Margin Item: three recent items at 10 revenue / 9 estimated cost.
-- Repeat Item: three recent sale dates plus two recent receipts.
insert into public.sales (id, business_id, sale_number, sold_at, subtotal, total, notes, created_by)
values
  ('50000000-0000-0000-0000-000000001301', '10000000-0000-0000-0000-000000001301', 1, ((((current_timestamp at time zone 'America/New_York')::date - 45)::timestamp + interval '12 hours') at time zone 'America/New_York'), 10.0000, 10.0000, null, '00000000-0000-0000-0000-000000001301'),
  ('50000000-0000-0000-0000-000000001302', '10000000-0000-0000-0000-000000001301', 2, ((((current_timestamp at time zone 'America/New_York')::date - 20)::timestamp + interval '12 hours') at time zone 'America/New_York'), 25.0000, 25.0000, null, '00000000-0000-0000-0000-000000001301'),
  ('50000000-0000-0000-0000-000000001303', '10000000-0000-0000-0000-000000001301', 3, ((((current_timestamp at time zone 'America/New_York')::date - 10)::timestamp + interval '12 hours') at time zone 'America/New_York'), 25.0000, 25.0000, null, '00000000-0000-0000-0000-000000001301'),
  ('50000000-0000-0000-0000-000000001304', '10000000-0000-0000-0000-000000001301', 4, ((((current_timestamp at time zone 'America/New_York')::date - 1)::timestamp + interval '12 hours') at time zone 'America/New_York'), 25.0000, 25.0000, null, '00000000-0000-0000-0000-000000001301'),
  ('50000000-0000-0000-0000-000000001305', '10000000-0000-0000-0000-000000001301', 5, ((((current_timestamp at time zone 'America/New_York')::date - 18)::timestamp + interval '12 hours') at time zone 'America/New_York'), 15.0000, 15.0000, null, '00000000-0000-0000-0000-000000001301'),
  ('50000000-0000-0000-0000-000000001306', '10000000-0000-0000-0000-000000001301', 6, ((((current_timestamp at time zone 'America/New_York')::date - 9)::timestamp + interval '12 hours') at time zone 'America/New_York'), 15.0000, 15.0000, null, '00000000-0000-0000-0000-000000001301'),
  ('50000000-0000-0000-0000-000000001307', '10000000-0000-0000-0000-000000001301', 7, ((((current_timestamp at time zone 'America/New_York')::date - 2)::timestamp + interval '12 hours') at time zone 'America/New_York'), 15.0000, 15.0000, null, '00000000-0000-0000-0000-000000001301'),
  -- Current partial business-local date must never enter completed-period evidence.
  ('50000000-0000-0000-0000-000000001308', '10000000-0000-0000-0000-000000001301', 8, (((current_timestamp at time zone 'America/New_York')::date::timestamp + interval '1 hour') at time zone 'America/New_York'), 500.0000, 500.0000, 'private sale note', '00000000-0000-0000-0000-000000001301');

insert into public.sale_items (business_id, sale_id, product_id, product_name, product_sku, quantity, unit_price, line_total, estimated_unit_cost_basis, estimated_cost_source)
values
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001301', '30000000-0000-0000-0000-000000001301', 'Restock Item', 'OPP-R', 2.000, 5.0000, 10.0000, 2.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001302', '30000000-0000-0000-0000-000000001301', 'Restock Item', 'OPP-R', 2.000, 5.0000, 10.0000, 2.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001303', '30000000-0000-0000-0000-000000001301', 'Restock Item', 'OPP-R', 2.000, 5.0000, 10.0000, 2.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001304', '30000000-0000-0000-0000-000000001301', 'Restock Item', 'OPP-R', 2.000, 5.0000, 10.0000, 2.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001305', '30000000-0000-0000-0000-000000001303', 'Margin Item', 'OPP-M', 1.000, 10.0000, 10.0000, 9.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001306', '30000000-0000-0000-0000-000000001303', 'Margin Item', 'OPP-M', 1.000, 10.0000, 10.0000, 9.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001307', '30000000-0000-0000-0000-000000001303', 'Margin Item', 'OPP-M', 1.000, 10.0000, 10.0000, 9.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001308', '30000000-0000-0000-0000-000000001301', 'Restock Item', 'OPP-R', 100.000, 5.0000, 500.0000, 2.0000, 'manual');

-- Add Repeat Item to the three completed recent sales using separate sales.
insert into public.sales (id, business_id, sale_number, sold_at, subtotal, total, created_by)
values
  ('50000000-0000-0000-0000-000000001309', '10000000-0000-0000-0000-000000001301', 9, ((((current_timestamp at time zone 'America/New_York')::date - 17)::timestamp + interval '12 hours') at time zone 'America/New_York'), 5.0000, 5.0000, '00000000-0000-0000-0000-000000001301'),
  ('50000000-0000-0000-0000-000000001310', '10000000-0000-0000-0000-000000001301', 10, ((((current_timestamp at time zone 'America/New_York')::date - 8)::timestamp + interval '12 hours') at time zone 'America/New_York'), 5.0000, 5.0000, '00000000-0000-0000-0000-000000001301'),
  ('50000000-0000-0000-0000-000000001311', '10000000-0000-0000-0000-000000001301', 11, ((((current_timestamp at time zone 'America/New_York')::date - 3)::timestamp + interval '12 hours') at time zone 'America/New_York'), 5.0000, 5.0000, '00000000-0000-0000-0000-000000001301');
insert into public.sale_items (business_id, sale_id, product_id, product_name, product_sku, quantity, unit_price, line_total, estimated_unit_cost_basis, estimated_cost_source)
values
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001309', '30000000-0000-0000-0000-000000001304', 'Repeat Item', 'OPP-P', 1.000, 5.0000, 5.0000, 2.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001310', '30000000-0000-0000-0000-000000001304', 'Repeat Item', 'OPP-P', 1.000, 5.0000, 5.0000, 2.0000, 'manual'),
  ('10000000-0000-0000-0000-000000001301', '50000000-0000-0000-0000-000000001311', '30000000-0000-0000-0000-000000001304', 'Repeat Item', 'OPP-P', 1.000, 5.0000, 5.0000, 2.0000, 'manual');

insert into public.purchases (id, business_id, purchase_number, request_id, received_at, subtotal, total, notes, created_by)
values
  ('60000000-0000-0000-0000-000000001301', '10000000-0000-0000-0000-000000001301', 1, '80000000-0000-0000-0000-000000001301', ((((current_timestamp at time zone 'America/New_York')::date - 20)::timestamp + interval '12 hours') at time zone 'America/New_York'), 10.0000, 10.0000, 'private supplier note', '00000000-0000-0000-0000-000000001301'),
  ('60000000-0000-0000-0000-000000001302', '10000000-0000-0000-0000-000000001301', 2, '80000000-0000-0000-0000-000000001302', ((((current_timestamp at time zone 'America/New_York')::date - 5)::timestamp + interval '12 hours') at time zone 'America/New_York'), 10.0000, 10.0000, null, '00000000-0000-0000-0000-000000001301');
insert into public.purchase_items (business_id, purchase_id, product_id, product_name, product_sku, quantity, unit_cost, line_total)
values
  ('10000000-0000-0000-0000-000000001301', '60000000-0000-0000-0000-000000001301', '30000000-0000-0000-0000-000000001304', 'Repeat Item', 'OPP-P', 5.000, 2.0000, 10.0000),
  ('10000000-0000-0000-0000-000000001301', '60000000-0000-0000-0000-000000001302', '30000000-0000-0000-0000-000000001304', 'Repeat Item', 'OPP-P', 5.000, 2.0000, 10.0000);

insert into public.customers (business_id, name, phone, email, note)
values (
  '10000000-0000-0000-0000-000000001301', 'Private Customer',
  '+1-555-0131', 'private-customer@stockpilot.test', 'private customer note'
);

insert into public.suppliers (business_id, name, contact_name, phone, email, notes)
values (
  '10000000-0000-0000-0000-000000001301', 'Private Supplier',
  'Private Contact', '+1-555-0132', 'private-supplier@stockpilot.test', 'private supplier profile note'
);

-- Anonymous cannot execute the private-by-default RPC.
set local role anon;
select throws_like(
  $$ select public.get_business_opportunities('10000000-0000-0000-0000-000000001301') $$,
  '%permission denied%',
  'anonymous callers cannot execute opportunity signals'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001301","role":"authenticated"}', true);

select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001301')->>'schemaVersion', '1', 'owner receives versioned contract');
select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001301')->>'module', 'smart_insights', 'opportunity foundation reuses Smart Insights module');
select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001301')->'periods'->>'currentPartialDateExcluded', 'true', 'current partial business date is excluded');
select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001301')->'periods'->'observation'->>'endDate', ((current_timestamp at time zone 'America/New_York')::date - 1)::text, 'business-local completed date is authoritative');

select ok(jsonb_path_exists(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "RESTOCK_DEMAND")'), 'restock demand signal is emitted');
select ok(jsonb_path_exists(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "SALES_MOMENTUM")'), 'sales momentum signal is emitted');
select ok(jsonb_path_exists(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "SLOW_MOVING_STOCK")'), 'slow-moving stock signal is emitted');
select ok(jsonb_path_exists(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "MARGIN_ATTENTION")'), 'margin attention signal is emitted');
select ok(jsonb_path_exists(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "REPEATED_PURCHASE_DEMAND")'), 'repeated purchase demand signal is emitted');

select is(
  jsonb_path_query_first(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "RESTOCK_DEMAND")')->'evidence'->>'recordedSalesQuantity',
  '6.000',
  'exact Recorded Sales quantity is serialized as decimal text and excludes current day'
);
select is(
  jsonb_path_query_first(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "MARGIN_ATTENTION")')->'evidence'->>'estimatedGrossMarginPercent',
  '10.000000',
  'estimated margin remains an exact PostgreSQL decimal string'
);
select is(
  jsonb_path_query_first(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "REPEATED_PURCHASE_DEMAND")')->'evidence'->>'receiptCount',
  '2',
  'repeated purchasing evidence requires two receipts'
);

select ok(
  not jsonb_path_exists(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.product.name == "New Item")'),
  'insufficient-history product produces no false-positive signal'
);
select is(
  public.get_business_opportunities('10000000-0000-0000-0000-000000001301')->'eligibility'->'categories'->'SLOW_MOVING_STOCK'->>'insufficientHistoryProductCount',
  '1',
  'insufficient history is distinguished from zero activity'
);
select ok(
  jsonb_path_exists(public.get_business_opportunities('10000000-0000-0000-0000-000000001301'), '$.signals[*] ? (@.type == "SLOW_MOVING_STOCK" && @.product.name == "Slow Item")'),
  'complete-history zero activity can produce slow-moving review attention'
);

select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001301', 1)->'selection'->>'returnedSignals', '1', 'result limit is enforced');
select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001301', 1)->'selection'->>'truncated', 'true', 'truncation is explicit');
select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001301', 1)->'signals'->0->>'type', 'RESTOCK_DEMAND', 'stable ordering starts with high-priority restock demand');
select throws_ok($$ select public.get_business_opportunities('10000000-0000-0000-0000-000000001301', 101) $$, '22023', 'Limit must be between 1 and 100', 'limit above one hundred is rejected');

select ok(position('private sale note' in public.get_business_opportunities('10000000-0000-0000-0000-000000001301')::text) = 0, 'sale notes are excluded');
select ok(position('private supplier note' in public.get_business_opportunities('10000000-0000-0000-0000-000000001301')::text) = 0, 'supplier notes are excluded');
select ok(position('private-customer@stockpilot.test' in public.get_business_opportunities('10000000-0000-0000-0000-000000001301')::text) = 0, 'customer PII is excluded');
select ok(position('private customer note' in public.get_business_opportunities('10000000-0000-0000-0000-000000001301')::text) = 0, 'customer notes are excluded');
select ok(position('private-supplier@stockpilot.test' in public.get_business_opportunities('10000000-0000-0000-0000-000000001301')::text) = 0, 'supplier contact data is excluded');
select ok(position('private supplier profile note' in public.get_business_opportunities('10000000-0000-0000-0000-000000001301')::text) = 0, 'supplier profile notes are excluded');
select ok(position('Other Tenant Secret' in public.get_business_opportunities('10000000-0000-0000-0000-000000001301')::text) = 0, 'cross-tenant product data is excluded');

-- Manager allowed; lower roles, inactive membership, and other tenants denied.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001302","role":"authenticated"}', true);
select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001301')->>'schemaVersion', '1', 'manager is allowed');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001303","role":"authenticated"}', true);
select throws_ok($$ select public.get_business_opportunities('10000000-0000-0000-0000-000000001301') $$, '42501', 'Business Opportunity Advisor access is required', 'employee is denied');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001304","role":"authenticated"}', true);
select throws_ok($$ select public.get_business_opportunities('10000000-0000-0000-0000-000000001301') $$, '42501', 'Business Opportunity Advisor access is required', 'cashier is denied');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001305","role":"authenticated"}', true);
select throws_ok($$ select public.get_business_opportunities('10000000-0000-0000-0000-000000001301') $$, '42501', 'Business is unavailable', 'inactive member is denied');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001306","role":"authenticated"}', true);
select throws_ok($$ select public.get_business_opportunities('10000000-0000-0000-0000-000000001301') $$, '42501', 'Business is unavailable', 'cross-business caller is denied');
select throws_ok($$ select public.get_business_opportunities('10000000-0000-0000-0000-000000001302') $$, '42501', 'Smart Insights is not enabled for this business', 'module gating rejects disabled Smart Insights');
reset role;

-- Inventory-only operation returns explicit dependent-module states, not fake demand.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001301","role":"authenticated"}', true);
select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001303')->'modules'->>'sales', 'MODULE_DISABLED', 'disabled Sales is explicit');
select is(public.get_business_opportunities('10000000-0000-0000-0000-000000001303')->'eligibility'->'categories'->'REPEATED_PURCHASE_DEMAND'->>'status', 'SALES_MODULE_DISABLED', 'dependent signal identifies missing Sales');
select is(jsonb_array_length(public.get_business_opportunities('10000000-0000-0000-0000-000000001303')->'signals'), 0, 'inventory-only data does not invent demand');
reset role;

select * from finish();
rollback;
