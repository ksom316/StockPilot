begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'smart-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Smart Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000902', 'authenticated', 'authenticated', 'smart-manager@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Smart Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000000903', 'authenticated', 'authenticated', 'smart-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Smart Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000904', 'authenticated', 'authenticated', 'smart-cashier@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Smart Cashier"}', now(), now()),
  ('00000000-0000-0000-0000-000000000905', 'authenticated', 'authenticated', 'smart-second-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Second Owner"}', now(), now());

insert into public.businesses (id, name, currency, owner_user_id)
values
  ('10000000-0000-0000-0000-000000000901', 'Smart Business', 'USD', '00000000-0000-0000-0000-000000000901'),
  ('10000000-0000-0000-0000-000000000902', 'Second Tenant', 'USD', '00000000-0000-0000-0000-000000000905'),
  ('10000000-0000-0000-0000-000000000903', 'Inventory Only', 'USD', '00000000-0000-0000-0000-000000000901'),
  ('10000000-0000-0000-0000-000000000904', 'Partial Sales History', 'USD', '00000000-0000-0000-0000-000000000901');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000902', 'manager', 'active'),
  ('10000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000903', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000904', 'cashier', 'active');

update public.businesses
set timezone = 'America/New_York'
where id in (
  '10000000-0000-0000-0000-000000000901',
  '10000000-0000-0000-0000-000000000903',
  '10000000-0000-0000-0000-000000000904'
);

update public.business_modules set enabled = true
where business_id in (
  '10000000-0000-0000-0000-000000000901',
  '10000000-0000-0000-0000-000000000903',
  '10000000-0000-0000-0000-000000000904'
) and module = 'smart_insights';
update public.business_modules set enabled = true
where business_id in (
  '10000000-0000-0000-0000-000000000901',
  '10000000-0000-0000-0000-000000000904'
) and module = 'sales';
-- Purchasing is deliberately enabled for Inventory Only to prove it is not required
-- and does not unlock or alter Sales-derived facts.
update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000000903' and module = 'purchasing';

-- The schema stores only the most recent module transition. Backdate that real
-- field to model established Sales and a recent re-enable without inventing a
-- history table. Disabling the timestamp trigger is test-fixture setup only.
alter table public.business_modules disable trigger business_modules_set_updated_at;
update public.business_modules
set updated_at = (((current_timestamp at time zone 'America/New_York')::date - 40)::timestamp at time zone 'America/New_York')
where business_id = '10000000-0000-0000-0000-000000000901' and module = 'sales';
update public.business_modules
set updated_at = (((current_timestamp at time zone 'America/New_York')::date - 10)::timestamp at time zone 'America/New_York')
where business_id = '10000000-0000-0000-0000-000000000904' and module = 'sales';
alter table public.business_modules enable trigger business_modules_set_updated_at;

insert into public.products (id, business_id, name, sku, current_quantity, low_stock_threshold, is_active, created_at)
values
  ('30000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', 'Alpha', 'SMART-A', 10.125, 2.000, true,
    (((current_timestamp at time zone 'America/New_York')::date - 60)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901', 'Beta', 'SMART-B', 0.000, 0.000, true,
    (((current_timestamp at time zone 'America/New_York')::date - 60)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000000903', '10000000-0000-0000-0000-000000000901', 'Gamma', 'SMART-G', 1.500, 2.000, true,
    (((current_timestamp at time zone 'America/New_York')::date - 60)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000000904', '10000000-0000-0000-0000-000000000901', 'Delta', 'SMART-D', 2.000, 0.000, true,
    (((current_timestamp at time zone 'America/New_York')::date - 60)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000000905', '10000000-0000-0000-0000-000000000901', 'New Product', 'SMART-N', 4.000, 1.000, true,
    (((current_timestamp at time zone 'America/New_York')::date - 5)::timestamp at time zone 'America/New_York') + interval '12 hours'),
  ('30000000-0000-0000-0000-000000000906', '10000000-0000-0000-0000-000000000901', 'Inactive', 'SMART-X', 5.000, 1.000, false,
    (((current_timestamp at time zone 'America/New_York')::date - 60)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000000907', '10000000-0000-0000-0000-000000000902', 'Other Tenant Product', 'OTHER-A', 99.000, 1.000, true, now() - interval '60 days'),
  ('30000000-0000-0000-0000-000000000908', '10000000-0000-0000-0000-000000000903', 'Inventory Product', 'INV-A', 8.250, 2.000, true,
    (((current_timestamp at time zone 'America/New_York')::date - 60)::timestamp at time zone 'America/New_York')),
  ('30000000-0000-0000-0000-000000000909', '10000000-0000-0000-0000-000000000904', 'Partial Product', 'PART-A', 8.000, 2.000, true,
    (((current_timestamp at time zone 'America/New_York')::date - 60)::timestamp at time zone 'America/New_York'));

-- Three completed business-local sale dates total exactly 7.500 Alpha units.
insert into public.sales (id, business_id, sale_number, sold_at, subtotal, total, created_by)
values
  ('50000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', 1,
    (((current_timestamp at time zone 'America/New_York')::date - 29)::timestamp + interval '12 hours') at time zone 'America/New_York', 1.1250, 1.1250, '00000000-0000-0000-0000-000000000901'),
  ('50000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901', 2,
    (((current_timestamp at time zone 'America/New_York')::date - 15)::timestamp + interval '12 hours') at time zone 'America/New_York', 2.3750, 2.3750, '00000000-0000-0000-0000-000000000901'),
  ('50000000-0000-0000-0000-000000000903', '10000000-0000-0000-0000-000000000901', 3,
    (((current_timestamp at time zone 'America/New_York')::date - 1)::timestamp + interval '12 hours') at time zone 'America/New_York', 4.0000, 4.0000, '00000000-0000-0000-0000-000000000901'),
  -- Current partial date: must be excluded.
  ('50000000-0000-0000-0000-000000000904', '10000000-0000-0000-0000-000000000901', 4,
    ((current_timestamp at time zone 'America/New_York')::date::timestamp + interval '1 hour') at time zone 'America/New_York', 9.0000, 9.0000, '00000000-0000-0000-0000-000000000901'),
  -- Immediately before the 30-date window: must be excluded.
  ('50000000-0000-0000-0000-000000000905', '10000000-0000-0000-0000-000000000901', 5,
    ((((current_timestamp at time zone 'America/New_York')::date - 30)::timestamp at time zone 'America/New_York') - interval '1 second'), 8.0000, 8.0000, '00000000-0000-0000-0000-000000000901'),
  -- One sale date for Gamma and two for Delta exercise the evidence gate.
  ('50000000-0000-0000-0000-000000000906', '10000000-0000-0000-0000-000000000901', 6,
    (((current_timestamp at time zone 'America/New_York')::date - 10)::timestamp + interval '12 hours') at time zone 'America/New_York', 3.0000, 3.0000, '00000000-0000-0000-0000-000000000901'),
  ('50000000-0000-0000-0000-000000000907', '10000000-0000-0000-0000-000000000901', 7,
    (((current_timestamp at time zone 'America/New_York')::date - 9)::timestamp + interval '12 hours') at time zone 'America/New_York', 1.0000, 1.0000, '00000000-0000-0000-0000-000000000901'),
  ('50000000-0000-0000-0000-000000000908', '10000000-0000-0000-0000-000000000901', 8,
    (((current_timestamp at time zone 'America/New_York')::date - 8)::timestamp + interval '12 hours') at time zone 'America/New_York', 1.0000, 1.0000, '00000000-0000-0000-0000-000000000901');

insert into public.sale_items (business_id, sale_id, product_id, product_name, product_sku, quantity, unit_price, line_total)
values
  ('10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'Alpha', 'SMART-A', 1.125, 1.0000, 1.1250),
  ('10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000902', '30000000-0000-0000-0000-000000000901', 'Alpha', 'SMART-A', 2.375, 1.0000, 2.3750),
  ('10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000903', '30000000-0000-0000-0000-000000000901', 'Alpha', 'SMART-A', 4.000, 1.0000, 4.0000),
  ('10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000904', '30000000-0000-0000-0000-000000000901', 'Alpha', 'SMART-A', 9.000, 1.0000, 9.0000),
  ('10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000905', '30000000-0000-0000-0000-000000000901', 'Alpha', 'SMART-A', 8.000, 1.0000, 8.0000),
  ('10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000906', '30000000-0000-0000-0000-000000000903', 'Gamma', 'SMART-G', 3.000, 1.0000, 3.0000),
  ('10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000907', '30000000-0000-0000-0000-000000000904', 'Delta', 'SMART-D', 1.000, 1.0000, 1.0000),
  ('10000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000908', '30000000-0000-0000-0000-000000000904', 'Delta', 'SMART-D', 1.000, 1.0000, 1.0000);

-- These movement rows deliberately include every non-demand semantic. None may
-- alter sale_items-derived Recorded Sales quantity.
insert into public.inventory_movements (
  id, business_id, product_id, movement_type, quantity, quantity_before,
  quantity_after, reason, actor_user_id, source_type, source_reference, created_at
)
values
  ('70000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'stock_out', -1.000, 11.125, 10.125, 'Manual use', '00000000-0000-0000-0000-000000000901', 'manual', null, now() - interval '2 days'),
  ('70000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'damaged', -0.500, 10.625, 10.125, 'Damaged', '00000000-0000-0000-0000-000000000901', 'manual', null, now() - interval '3 days'),
  ('70000000-0000-0000-0000-000000000903', '10000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'lost', -0.250, 10.375, 10.125, 'Lost', '00000000-0000-0000-0000-000000000901', 'manual', null, now() - interval '4 days'),
  ('70000000-0000-0000-0000-000000000904', '10000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'adjustment', 0.125, 10.000, 10.125, 'Correction', '00000000-0000-0000-0000-000000000901', 'manual', null, now() - interval '5 days'),
  ('70000000-0000-0000-0000-000000000905', '10000000-0000-0000-0000-000000000901', '30000000-0000-0000-0000-000000000901', 'stock_out', -1.125, 11.250, 10.125, null, '00000000-0000-0000-0000-000000000901', 'sales', '50000000-0000-0000-0000-000000000901', now() - interval '6 days');

-- Anonymous has no EXECUTE grant.
set local role anon;
select throws_like(
  $$ select public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901') $$,
  '%permission denied%',
  'anonymous callers cannot execute Smart Inventory'
);
reset role;

-- Owner contract, exact calculations, stock states, bounds, and pagination.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901')->>'timezone', 'America/New_York', 'response identifies authoritative business timezone');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901')->'window'->>'completed_business_dates', '30', 'window contains thirty completed dates');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901')->'window'->>'end_date_exclusive', (current_timestamp at time zone 'America/New_York')::date::text, 'window excludes the current partial business-local date');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901')->'pagination'->>'total_items', '5', 'inactive products are excluded');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 2)->'pagination'->>'total_pages', '3', 'pagination metadata reports bounded pages');
select is(jsonb_array_length(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 2)->'products'), 2, 'page size bounds the product response');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 2)->'products'->0->>'product_name', 'Alpha', 'products use stable name ordering');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 2, 2)->'products'->0->>'product_name', 'Delta', 'later pages continue deterministic ordering');
select throws_ok(
  $$ select public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 101) $$,
  '22023', 'Page must be at least 1 and page size must be between 1 and 100',
  'page size above one hundred is rejected'
);

select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'stock'->>'state', 'IN_STOCK', 'stock above threshold is in stock');
-- Beta sorts before Delta but after Alpha.
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->1->'stock'->>'low_stock_threshold', '0.000', 'zero threshold is preserved without configuration claims');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->1->'stock'->>'state', 'OUT_OF_STOCK', 'zero stock takes precedence over threshold state');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->2->'stock'->>'state', 'IN_STOCK', 'positive stock with threshold zero is in stock');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->3->'stock'->>'state', 'LOW_STOCK', 'fractional quantity at or below threshold is low stock');

-- Alpha appears first and has three exact sale dates in the completed window.
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'sales_observation'->>'context_code', 'RECORDED_SALES_OBSERVED', 'positive completed Sales are factual observed demand');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'sales_observation'->>'recorded_sales_quantity', '7.500', 'Sales quantity is exact and excludes current-day and pre-window Sales');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'sales_observation'->>'distinct_sale_dates', '3', 'distinct business-local sale dates are counted');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'sales_observation'->>'average_recorded_quantity_per_day', '0.25000000000000000000', 'daily quantity uses PostgreSQL numeric without float drift');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'days_of_stock'->>'status', 'ESTIMATE_AVAILABLE', 'three sale dates and full coverage make estimate available');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'days_of_stock'->>'estimated_days', '40.5000000000000000', 'fractional stock estimate remains exact PostgreSQL numeric text');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'inventory_movement_observation'->>'movement_count', '5', 'manual, shrinkage, correction, and Sales movements remain separate factual ledger activity');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->0->'sales_observation'->>'recorded_sales_quantity', '7.500', 'inventory movements are not double-counted as Sales demand');

-- Beta has complete history and no Sales; zero stock prevents a days estimate.
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->1->'sales_observation'->>'context_code', 'NO_RECORDED_SALES_30D', 'zero Sales is asserted only with complete coverage');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->1->'days_of_stock'->>'status', 'DAYS_ESTIMATE_UNAVAILABLE', 'zero stock has no positive days estimate');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->1->'days_of_stock'->>'unavailable_reason', 'OUT_OF_STOCK', 'zero stock unavailability is explicit');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->1->'inventory_movement_observation'->>'context_code', 'NO_MOVEMENT_ATTENTION_UNAVAILABLE', 'zero stock does not receive positive-stock no-movement attention');

-- Delta has two sale dates and Gamma has one; neither passes the evidence gate.
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->2->'sales_observation'->>'distinct_sale_dates', '2', 'two distinct sale dates remain factual');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->2->'days_of_stock'->>'unavailable_reason', 'FEWER_THAN_THREE_SALE_DATES', 'two sale dates cannot produce an estimate');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->3->'sales_observation'->>'distinct_sale_dates', '1', 'one distinct sale date remains factual');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->3->'days_of_stock'->>'unavailable_reason', 'FEWER_THAN_THREE_SALE_DATES', 'one sale date cannot produce an estimate');

-- New Product is fifth and cannot be mislabeled as no demand.
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->4->'sales_observation'->>'context_code', 'INSUFFICIENT_HISTORY', 'new products return insufficient history');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->4->'sales_observation'->>'eligible_days', '4', 'midday product creation exposes only subsequent completed dates');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901', 1, 10)->'products'->4->'days_of_stock'->>'unavailable_reason', 'INSUFFICIENT_HISTORY', 'insufficient history suppresses days estimate');
reset role;

-- Manager and employee are allowed; cashier is rejected.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated"}', true);
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901')->>'business_id', '10000000-0000-0000-0000-000000000901', 'manager can use Smart Inventory');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000903","role":"authenticated"}', true);
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901')->>'business_id', '10000000-0000-0000-0000-000000000901', 'employee can use Smart Inventory');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000904","role":"authenticated"}', true);
select throws_ok(
  $$ select public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901') $$,
  '42501', 'Smart Inventory access is required',
  'cashier is rejected server-side'
);
reset role;

-- A second-tenant owner cannot inspect this business and cannot use their own
-- business while its Smart Insights module is disabled.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000905","role":"authenticated"}', true);
select throws_ok(
  $$ select public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000901') $$,
  '42501', 'Business is unavailable',
  'cross-tenant Smart Inventory access is denied'
);
select throws_ok(
  $$ select public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000902') $$,
  '42501', 'Smart Inventory is not enabled for this business',
  'disabled Smart Insights module rejects the RPC'
);
reset role;

-- Inventory-only remains useful and does not fabricate Sales demand/rates.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000903')->'modules'->>'sales_enabled', 'false', 'Inventory-only business explicitly reports Sales disabled');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000903')->'products'->0->'sales_observation'->>'context_code', 'SALES_DISABLED', 'Inventory-only result makes no Sales-demand claim');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000903')->'products'->0->'sales_observation'->>'recorded_sales_quantity', null, 'Inventory-only result omits Sales quantity');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000903')->'products'->0->'days_of_stock'->>'unavailable_reason', 'SALES_DISABLED', 'Inventory-only result has no demand-based estimate');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000903')->'products'->0->'inventory_movement_observation'->>'context_code', 'NO_RECORDED_INVENTORY_MOVEMENTS_30D', 'Inventory-only result provides factual no-movement context');

-- Recent Sales-module transition limits coverage even for an old product.
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000904')->'products'->0->'sales_observation'->>'eligible_days', '10', 'Sales transition timestamp conservatively limits observable dates');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000904')->'products'->0->'sales_observation'->>'context_code', 'INSUFFICIENT_HISTORY', 'partial Sales observability cannot assert no demand');
select is(public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000904')->'products'->0->'days_of_stock'->>'unavailable_reason', 'INSUFFICIENT_HISTORY', 'partial Sales observability suppresses estimate');
reset role;

select * from finish();
rollback;
