begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000911', 'authenticated', 'authenticated', 'observability-owner@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Observability Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000912', 'authenticated', 'authenticated', 'observability-cashier@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Observability Cashier"}', now(), now()),
  ('00000000-0000-0000-0000-000000000913', 'authenticated', 'authenticated', 'observability-other@stockpilot.test', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Other Owner"}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values
  ('10000000-0000-0000-0000-000000000911', 'Observability Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000000911'),
  ('10000000-0000-0000-0000-000000000912', 'Observability Other Tenant', 'USD', 'UTC', '00000000-0000-0000-0000-000000000913');

insert into public.business_members (business_id, user_id, role, status)
values ('10000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000912', 'cashier', 'active');

update public.business_modules
set enabled = true
where business_id = '10000000-0000-0000-0000-000000000911'
  and module = 'smart_insights';

-- Start from a deterministic old disabled-row timestamp, then verify the first
-- real enable establishes a fresh observability boundary.
alter table public.business_modules disable trigger business_modules_set_updated_at;
update public.business_modules
set updated_at = current_timestamp - interval '40 days'
where business_id = '10000000-0000-0000-0000-000000000911'
  and module = 'sales';
alter table public.business_modules enable trigger business_modules_set_updated_at;

-- PostgreSQL runs same-kind triggers in name order. Delay this update inside the
-- statement before the production trigger executes, then capture both clocks
-- from that same statement. statement_timestamp() would equal statement_started_at;
-- clock_timestamp() must reflect the later trigger execution.
create function private.aaa_test_delay_business_module_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_sleep(0.02);
  return new;
end;
$$;

create trigger aaa_test_delay_business_module_update
before update on public.business_modules
for each row execute function private.aaa_test_delay_business_module_update();

create temporary table sales_execution_evidence (
  boundary timestamptz not null,
  statement_started_at timestamptz not null
) on commit drop;

with transitioned as (
  update public.business_modules
  set enabled = true
  where business_id = '10000000-0000-0000-0000-000000000911'
    and module = 'sales'
  returning updated_at, statement_timestamp() as statement_started_at
)
insert into sales_execution_evidence (boundary, statement_started_at)
select updated_at, statement_started_at from transitioned;

drop trigger aaa_test_delay_business_module_update on public.business_modules;
drop function private.aaa_test_delay_business_module_update();

select ok(
  (select boundary > statement_started_at from sales_execution_evidence),
  'Sales transition records trigger execution time rather than statement start time'
);
select ok(
  (select updated_at > current_timestamp - interval '1 day'
   from public.business_modules
   where business_id = '10000000-0000-0000-0000-000000000911' and module = 'sales'),
  'initial Sales enable establishes a current observability boundary'
);

-- Model an established enabled Sales row. This is fixture setup equivalent to
-- the conservative migration state of an existing row whose timestamp predates
-- the complete observation window.
alter table public.business_modules disable trigger business_modules_set_updated_at;
update public.business_modules
set updated_at = current_timestamp - interval '40 days'
where business_id = '10000000-0000-0000-0000-000000000911'
  and module = 'sales';
alter table public.business_modules enable trigger business_modules_set_updated_at;

create temporary table sales_boundary_evidence (boundary timestamptz not null) on commit drop;
insert into sales_boundary_evidence
select updated_at
from public.business_modules
where business_id = '10000000-0000-0000-0000-000000000911' and module = 'sales';

insert into public.products (
  id, business_id, name, sku, current_quantity, low_stock_threshold,
  is_active, created_at
)
values (
  '30000000-0000-0000-0000-000000000911',
  '10000000-0000-0000-0000-000000000911',
  'Observed Product',
  'OBS-1',
  14.000,
  2.000,
  true,
  current_timestamp - interval '60 days'
);

insert into public.sales (id, business_id, sale_number, sold_at, subtotal, total, created_by)
values
  ('50000000-0000-0000-0000-000000000911', '10000000-0000-0000-0000-000000000911', 1, current_date - 29 + time '12:00', 1.0000, 1.0000, '00000000-0000-0000-0000-000000000911'),
  ('50000000-0000-0000-0000-000000000912', '10000000-0000-0000-0000-000000000911', 2, current_date - 15 + time '12:00', 2.0000, 2.0000, '00000000-0000-0000-0000-000000000911'),
  ('50000000-0000-0000-0000-000000000913', '10000000-0000-0000-0000-000000000911', 3, current_date - 1 + time '12:00', 4.0000, 4.0000, '00000000-0000-0000-0000-000000000911');

insert into public.sale_items (
  business_id, sale_id, product_id, product_name, product_sku,
  quantity, unit_price, line_total
)
values
  ('10000000-0000-0000-0000-000000000911', '50000000-0000-0000-0000-000000000911', '30000000-0000-0000-0000-000000000911', 'Observed Product', 'OBS-1', 1.000, 1.0000, 1.0000),
  ('10000000-0000-0000-0000-000000000911', '50000000-0000-0000-0000-000000000912', '30000000-0000-0000-0000-000000000911', 'Observed Product', 'OBS-1', 2.000, 1.0000, 2.0000),
  ('10000000-0000-0000-0000-000000000911', '50000000-0000-0000-0000-000000000913', '30000000-0000-0000-0000-000000000911', 'Observed Product', 'OBS-1', 4.000, 1.0000, 4.0000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000911","role":"authenticated"}', true);
select is(
  public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000911')->'products'->0->'days_of_stock'->>'status',
  'ESTIMATE_AVAILABLE',
  'sufficient established Sales coverage remains eligible for an estimate'
);
select is(
  public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000911')->'products'->0->'days_of_stock'->>'estimated_days',
  '60.0000000000000000',
  'eligible days-of-stock calculation preserves exact numeric behavior'
);
reset role;

-- A retried/no-op enable must preserve the proven boundary and eligibility.
update public.business_modules
set enabled = true
where business_id = '10000000-0000-0000-0000-000000000911'
  and module = 'sales';

select is(
  (select updated_at from public.business_modules where business_id = '10000000-0000-0000-0000-000000000911' and module = 'sales'),
  (select boundary from sales_boundary_evidence),
  'enabled true to true preserves the Sales observability boundary'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000911","role":"authenticated"}', true);
select is(
  public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000911')->'products'->0->'sales_observation'->>'context_code',
  'RECORDED_SALES_OBSERVED',
  'no-op enable does not turn an eligible product into insufficient history'
);
select is(
  public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000911')->'products'->0->'days_of_stock'->>'status',
  'ESTIMATE_AVAILABLE',
  'no-op enable preserves days-of-stock eligibility'
);
reset role;

-- A real disable and re-enable starts a new current observation interval.
update public.business_modules
set enabled = false
where business_id = '10000000-0000-0000-0000-000000000911'
  and module = 'sales';
update public.business_modules
set enabled = true
where business_id = '10000000-0000-0000-0000-000000000911'
  and module = 'sales';

select ok(
  (select updated_at > boundary
   from public.business_modules cross join sales_boundary_evidence
   where business_id = '10000000-0000-0000-0000-000000000911' and module = 'sales'),
  'disable then re-enable establishes a new Sales observability boundary'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000911","role":"authenticated"}', true);
select is(
  public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000911')->'products'->0->'sales_observation'->>'context_code',
  'INSUFFICIENT_HISTORY',
  'genuine Sales re-enable requires a new complete observation window'
);
select is(
  public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000911')->'products'->0->'days_of_stock'->>'unavailable_reason',
  'INSUFFICIENT_HISTORY',
  'days-of-stock remains unavailable immediately after genuine re-enable'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000912","role":"authenticated"}', true);
select throws_ok(
  $$ select public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000911') $$,
  '42501', 'Smart Inventory access is required',
  'cashier access remains denied after transition-tracking correction'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000913","role":"authenticated"}', true);
select throws_ok(
  $$ select public.get_smart_inventory_snapshot('10000000-0000-0000-0000-000000000911') $$,
  '42501', 'Business is unavailable',
  'cross-tenant access remains denied after transition-tracking correction'
);
reset role;

select * from finish();
rollback;
