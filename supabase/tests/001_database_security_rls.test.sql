begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner-a@stockpilot.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Owner A"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'employee-a@stockpilot.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Employee A"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'cashier-a@stockpilot.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Cashier A"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'owner-b@stockpilot.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Owner B"}'::jsonb,
    now(),
    now()
  );

insert into public.businesses (id, name, currency, owner_user_id)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'Business A',
    'USD',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Business B',
    'USD',
    '00000000-0000-0000-0000-000000000004'
  );

insert into public.business_members (business_id, user_id, role, status)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'employee',
    'active'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'cashier',
    'active'
  );

insert into public.categories (id, business_id, name)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Category A'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'Category B'
  );

insert into public.products (id, business_id, category_id, name, sku)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Product A',
    'SKU-A'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Product B',
    'SKU-B'
  );

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.record_inventory_movement(
  '30000000-0000-0000-0000-000000000001',
  'stock_in',
  5,
  'Initial test balance',
  'system',
  '40000000-0000-0000-0000-000000000001'
);

select public.record_inventory_movement(
  '30000000-0000-0000-0000-000000000002',
  'stock_in',
  5,
  'Initial test balance',
  'system',
  '40000000-0000-0000-0000-000000000002'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'an authenticated user can read only their own profile'
);

select is(
  (select count(*) from public.businesses where id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'user A cannot read user B business'
);

select is(
  (select count(*) from public.categories where business_id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'user A cannot read user B categories'
);

select is(
  (select count(*) from public.products where business_id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'user A cannot read user B products'
);

select is(
  (select count(*) from public.business_modules where business_id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'user A cannot read user B module configuration'
);

select is(
  (select count(*) from public.business_members where business_id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'user A cannot read user B memberships'
);

select is(
  (select count(*) from public.inventory_movements where business_id = '10000000-0000-0000-0000-000000000002'),
  0::bigint,
  'user A cannot read user B inventory history'
);

update public.products
set name = 'Cross-tenant overwrite'
where id = '30000000-0000-0000-0000-000000000002';

reset role;

select is(
  (select name from public.products where id = '30000000-0000-0000-0000-000000000002'),
  'Product B',
  'user A cannot modify user B products'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

update public.businesses
set name = 'Business A Updated'
where id = '10000000-0000-0000-0000-000000000001';

update public.products
set selling_price = 12.50
where id = '30000000-0000-0000-0000-000000000001';

update public.business_modules
set enabled = true
where business_id = '10000000-0000-0000-0000-000000000001'
  and module = 'sales';

update public.business_members
set role = 'manager'
where business_id = '10000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-000000000002';

reset role;

select is(
  (select name from public.businesses where id = '10000000-0000-0000-0000-000000000001'),
  'Business A Updated',
  'owner can update business settings'
);

select is(
  (select selling_price from public.products where id = '30000000-0000-0000-0000-000000000001'),
  12.5000::numeric,
  'owner can manage products'
);

select is(
  (
    select enabled
    from public.business_modules
    where business_id = '10000000-0000-0000-0000-000000000001'
      and module = 'sales'
  ),
  true,
  'owner can enable an optional module'
);

select is(
  (
    select role::text
    from public.business_members
    where business_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-000000000002'
  ),
  'manager',
  'owner can manage a non-owner membership role'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

update public.business_members
set role = 'employee'
where business_id = '10000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-000000000002';

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

update public.categories
set description = 'Managed by employee'
where id = '20000000-0000-0000-0000-000000000001';

update public.products
set name = 'Product A Employee Updated'
where id = '30000000-0000-0000-0000-000000000001';

reset role;

select is(
  (select description from public.categories where id = '20000000-0000-0000-0000-000000000001'),
  'Managed by employee',
  'employee can manage categories for their business'
);

select is(
  (select name from public.products where id = '30000000-0000-0000-0000-000000000001'),
  'Product A Employee Updated',
  'employee can manage products for their business'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.products where id = '30000000-0000-0000-0000-000000000001'),
  1::bigint,
  'cashier can read products for their business'
);

update public.products
set name = 'Cashier overwrite'
where id = '30000000-0000-0000-0000-000000000001';

reset role;

select is(
  (select name from public.products where id = '30000000-0000-0000-0000-000000000001'),
  'Product A Employee Updated',
  'cashier cannot modify products'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.record_inventory_movement(
      '30000000-0000-0000-0000-000000000001',
      'stock_out',
      1,
      'Cashier adjustment attempt'
    )
  $$,
  '42501',
  'Product was not found or is not accessible',
  'cashier cannot create inventory movements'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

update public.business_members
set role = 'owner'
where business_id = '10000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-000000000002';

reset role;

select is(
  (
    select role::text
    from public.business_members
    where business_id = '10000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-000000000002'
  ),
  'employee',
  'employee cannot promote themselves'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

update public.business_modules
set enabled = false
where business_id = '10000000-0000-0000-0000-000000000001'
  and module = 'sales';

reset role;

select is(
  (
    select enabled
    from public.business_modules
    where business_id = '10000000-0000-0000-0000-000000000001'
      and module = 'sales'
  ),
  true,
  'non-owner cannot disable an optional module'
);

select ok(
  not has_column_privilege('authenticated', 'public.products', 'current_quantity', 'UPDATE'),
  'authenticated role has no UPDATE privilege on current_quantity'
);

select ok(
  not has_column_privilege('authenticated', 'public.products', 'current_quantity', 'INSERT'),
  'authenticated role has no INSERT privilege on current_quantity'
);

select ok(
  not has_table_privilege('authenticated', 'public.inventory_movements', 'INSERT'),
  'authenticated role cannot insert inventory history directly'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select throws_like(
  $$
    update public.products
    set current_quantity = 99
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  '%permission denied%',
  'direct current_quantity manipulation is blocked'
);

select lives_ok(
  $$
    select public.record_inventory_movement(
      '30000000-0000-0000-0000-000000000001',
      'stock_in',
      3,
      'Employee stock in'
    )
  $$,
  'authorized employee inventory movement succeeds'
);

select throws_ok(
  $$
    select public.record_inventory_movement(
      '30000000-0000-0000-0000-000000000001',
      'stock_in',
      1,
      'Forged sale source',
      'sales',
      '40000000-0000-0000-0000-000000000099'
    )
  $$,
  '42501',
  'Authenticated inventory adjustments must use a manual source without a source reference',
  'authenticated user cannot forge a module-generated movement source'
);

reset role;

select is(
  (select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000001'),
  8.000::numeric,
  'authorized inventory movement updates product quantity'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.record_inventory_movement(
      '30000000-0000-0000-0000-000000000001',
      'stock_in',
      1,
      'Cross-tenant attempt'
    )
  $$,
  '42501',
  'Product was not found or is not accessible',
  'unauthorized cross-tenant inventory movement fails'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.record_inventory_movement(
      '30000000-0000-0000-0000-000000000001',
      'stock_out',
      9,
      'Negative stock attempt'
    )
  $$,
  '23514',
  'Inventory movement would produce negative stock',
  'inventory movement cannot produce negative stock'
);

reset role;

select is(
  (select current_quantity from public.products where id = '30000000-0000-0000-0000-000000000001'),
  8.000::numeric,
  'failed negative movement leaves quantity unchanged'
);

select is(
  (
    select actor_user_id
    from public.inventory_movements
    where product_id = '30000000-0000-0000-0000-000000000001'
      and reason = 'Employee stock in'
  ),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'inventory movement records auth.uid() as the actor'
);

select * from finish();

rollback;
