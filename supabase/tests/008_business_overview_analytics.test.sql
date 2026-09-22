begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000801', 'authenticated', 'authenticated', 'overview-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Overview Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000802', 'authenticated', 'authenticated', 'overview-manager@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Overview Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000000803', 'authenticated', 'authenticated', 'overview-employee@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Overview Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000000804', 'authenticated', 'authenticated', 'overview-cashier@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Overview Cashier"}', now(), now()),
  ('00000000-0000-0000-0000-000000000805', 'authenticated', 'authenticated', 'overview-outsider@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Overview Outsider"}', now(), now());

insert into public.businesses (id, name, currency, owner_user_id)
values
  ('10000000-0000-0000-0000-000000000801', 'Overview Business A', 'USD', '00000000-0000-0000-0000-000000000801'),
  ('10000000-0000-0000-0000-000000000802', 'Overview Business B', 'USD', '00000000-0000-0000-0000-000000000805');
insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000802', 'manager', 'active'),
  ('10000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000803', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000804', 'cashier', 'active');

update public.businesses set timezone = 'America/New_York' where id = '10000000-0000-0000-0000-000000000801';
insert into public.products (id, business_id, name, sku, current_quantity, low_stock_threshold, is_active)
values
  ('30000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000801', 'Alpha', 'OV-A', 0, 3, true),
  ('30000000-0000-0000-0000-000000000802', '10000000-0000-0000-0000-000000000801', 'Beta', 'OV-B', 2.500, 3, true),
  ('30000000-0000-0000-0000-000000000803', '10000000-0000-0000-0000-000000000801', 'Inactive', 'OV-X', 0, 3, false);

-- Inventory-only is useful and explicitly marks optional modules disabled.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'inventory'->>'active_products', '2', 'Inventory active count excludes inactive products');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'inventory'->>'low_stock_products', '1', 'low stock is positive quantity at or below threshold');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'inventory'->>'out_of_stock_products', '1', 'zero quantity is out of stock, not double-counted low stock');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->>'enabled', 'false', 'disabled Sales is distinct from an enabled empty period');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'purchasing'->>'enabled', 'false', 'disabled Purchasing is explicit');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->>'timezone', 'America/New_York', 'response identifies authoritative business timezone');
reset role;

update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000000801' and module in ('sales', 'purchasing');
insert into public.sales (id, business_id, sale_number, sold_at, subtotal, total, created_by)
values
  ('50000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000801', 1, '2026-03-08 04:30:00+00', 1.0001, 1.0001, '00000000-0000-0000-0000-000000000801'),
  ('50000000-0000-0000-0000-000000000802', '10000000-0000-0000-0000-000000000801', 2, '2026-03-08 05:30:00+00', 7.0002, 7.0002, '00000000-0000-0000-0000-000000000801'),
  ('50000000-0000-0000-0000-000000000803', '10000000-0000-0000-0000-000000000801', 3, '2026-03-09 03:59:59+00', 2.0000, 2.0000, '00000000-0000-0000-0000-000000000801');
insert into public.sale_items (business_id, sale_id, product_id, product_name, product_sku, quantity, unit_price, line_total)
values
  ('10000000-0000-0000-0000-000000000801', '50000000-0000-0000-0000-000000000801', '30000000-0000-0000-0000-000000000801', 'Old Alpha', 'OLD-A', 1.125, 0.8890, 1.0001),
  ('10000000-0000-0000-0000-000000000801', '50000000-0000-0000-0000-000000000802', '30000000-0000-0000-0000-000000000801', 'Old Alpha', 'OLD-A', 3.500, 0.8572, 3.0002),
  ('10000000-0000-0000-0000-000000000801', '50000000-0000-0000-0000-000000000802', '30000000-0000-0000-0000-000000000802', 'Old Beta', 'OLD-B', 2.500, 0.8000, 2.0000),
  ('10000000-0000-0000-0000-000000000801', '50000000-0000-0000-0000-000000000803', '30000000-0000-0000-0000-000000000802', 'Old Beta', 'OLD-B', 1.000, 2.0000, 2.0000);
update public.products set name = 'Renamed Alpha', sku = 'NEW-A' where id = '30000000-0000-0000-0000-000000000801';

insert into public.purchases (id, business_id, purchase_number, request_id, received_at, subtotal, total, created_by)
values ('60000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000801', 1, '40000000-0000-0000-0000-000000000801', '2026-03-08 06:00:00+00', 7.0002, 7.0002, '00000000-0000-0000-0000-000000000801');
insert into public.purchase_items (business_id, purchase_id, product_id, product_name, product_sku, quantity, unit_cost, line_total)
values ('10000000-0000-0000-0000-000000000801', '60000000-0000-0000-0000-000000000801', '30000000-0000-0000-0000-000000000801', 'Old Alpha', 'OLD-A', 2.125, 3.2942, 7.0002);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->>'recorded_sales', '9.0002', 'Recorded Sales sums exact selected business-local dates');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->>'sale_count', '2', 'Sales count respects the local-date half-open boundary');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->>'average_recorded_sale', '4.5001', 'average remains exact numeric text without float rounding');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->>'units_sold', '7.000', 'fractional Units Sold remain exact');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->'top_products_by_units_sold'->0->>'product_name', 'Old Alpha', 'top products use immutable historical names and deterministic alphabetical tie-breaking');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->'top_products_by_units_sold'->0->>'units_sold', '3.500', 'top product ranking uses units sold');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->'daily_trend'->0->>'date', '2026-03-08', 'trend date is business local date across DST transition');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'sales'->'daily_trend'->0->>'recorded_sales', '9.0002', 'trend contains exact Recorded Sales');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'purchasing'->>'receipt_count', '1', 'Purchasing receipt count is available to owner');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'purchasing'->>'purchase_receipts', '7.0002', 'Purchase Receipt total preserves numeric precision');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'purchasing'->>'quantity_received', '2.125', 'quantity received preserves three-decimal convention');
select ok(not (public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08') ? 'finance'), 'overview response does not contain Finance section');
select ok(not (public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08') ? 'customers'), 'overview response does not contain customer data');
select throws_ok($$ select public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2027-03-09') $$, '22023', 'A valid date range of at most 366 calendar days is required', 'oversized date range is rejected');
reset role;

-- Empty enabled modules are represented as enabled with exact zeroes and a NULL average.
update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000000802' and module = 'sales';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000805","role":"authenticated"}', true);
select is(public.get_business_overview('10000000-0000-0000-0000-000000000802', '2026-03-08', '2026-03-08')->'inventory'->>'active_products', '0', 'empty inventory produces zero counts');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000802', '2026-03-08', '2026-03-08')->'sales'->>'enabled', 'true', 'enabled Sales remains distinguishable in an empty period');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000802', '2026-03-08', '2026-03-08')->'sales'->>'recorded_sales', '0.0000', 'empty Sales total is exact zero');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000802', '2026-03-08', '2026-03-08')->'sales'->>'average_recorded_sale', null, 'average is null when no sale exists');
select is(jsonb_array_length(public.get_business_overview('10000000-0000-0000-0000-000000000802', '2026-03-08', '2026-03-10')->'sales'->'daily_trend'), 3, 'daily trend includes every date as bounded zero-filled buckets');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000802', '2026-03-08', '2026-03-08')->'purchasing'->>'available', 'false', 'disabled Purchasing is not available to owner');
reset role;

-- Purchasing is restricted to the same active roles as its existing policies.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000804","role":"authenticated"}', true);
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'purchasing'->>'enabled', 'true', 'cashier can distinguish enabled Purchasing module state');
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'purchasing'->>'available', 'false', 'cashier is not granted Purchasing analytics');
select ok(not (public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'purchasing' ? 'purchase_receipts'), 'cashier response omits purchase metrics');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000803","role":"authenticated"}', true);
select is(public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08')->'purchasing'->>'available', 'true', 'employee retains existing Purchasing access');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000805","role":"authenticated"}', true);
select throws_ok($$ select public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08') $$, '42501', 'Business is unavailable', 'nonmember is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801","role":"authenticated"}', true);
select throws_ok($$ select public.get_business_overview('10000000-0000-0000-0000-000000000802', '2026-03-08', '2026-03-08') $$, '42501', 'Business is unavailable', 'cross-business access is denied');
reset role;

set local role anon;
select throws_like($$ select public.get_business_overview('10000000-0000-0000-0000-000000000801', '2026-03-08', '2026-03-08') $$, '%permission denied%', 'anonymous role cannot execute the overview RPC');
reset role;

select * from finish();
rollback;
