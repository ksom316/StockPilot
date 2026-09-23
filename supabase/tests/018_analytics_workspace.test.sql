begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001801', 'authenticated', 'authenticated', 'analytics-owner@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001802', 'authenticated', 'authenticated', 'analytics-outsider@stockpilot.test', '', now(), '{}', '{}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values ('10000000-0000-0000-0000-000000001801', 'Analytics Business', 'USD', 'America/New_York', '00000000-0000-0000-0000-000000001801');
insert into public.businesses (id, name, currency, timezone, owner_user_id)
values ('10000000-0000-0000-0000-000000001802', 'Other Analytics Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001802');
update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000001801' and module in ('analytics', 'sales', 'purchasing', 'expenses');
update public.business_modules set enabled = true where business_id = '10000000-0000-0000-0000-000000001802' and module = 'analytics';

insert into public.products (id, business_id, name, sku, cost_price, selling_price, current_quantity, low_stock_threshold)
values ('30000000-0000-0000-0000-000000001801', '10000000-0000-0000-0000-000000001801', 'Analytics Product', 'AN-1', 6, 10, 4, 1);
insert into public.sales (id, business_id, sale_number, sold_at, subtotal, total, created_by)
values ('40000000-0000-0000-0000-000000001801', '10000000-0000-0000-0000-000000001801', 1, '2026-01-02 04:30:00+00', 20, 20, '00000000-0000-0000-0000-000000001801');
insert into public.sale_items (business_id, sale_id, product_id, product_name, product_sku, quantity, unit_price, line_total, estimated_unit_cost_basis, estimated_cost_source)
values ('10000000-0000-0000-0000-000000001801', '40000000-0000-0000-0000-000000001801', '30000000-0000-0000-0000-000000001801', 'Analytics Product', 'AN-1', 2, 10, 20, 6, 'manual');
insert into public.purchases (id, business_id, purchase_number, request_id, received_at, subtotal, total, created_by)
values ('50000000-0000-0000-0000-000000001801', '10000000-0000-0000-0000-000000001801', 1, '60000000-0000-0000-0000-000000001801', '2026-01-02 18:00:00+00', 12, 12, '00000000-0000-0000-0000-000000001801');
insert into public.purchase_items (business_id, purchase_id, product_id, product_name, product_sku, quantity, unit_cost, line_total)
values ('10000000-0000-0000-0000-000000001801', '50000000-0000-0000-0000-000000001801', '30000000-0000-0000-0000-000000001801', 'Analytics Product', 'AN-1', 2, 6, 12);
insert into public.expenses (business_id, category_id, category_name, amount, expense_date, description, created_by, updated_by)
select '10000000-0000-0000-0000-000000001801', category.id, category.name, 3, '2026-01-02', 'Analytics expense', '00000000-0000-0000-0000-000000001801', '00000000-0000-0000-0000-000000001801'
from public.expense_categories as category where category.business_id = '10000000-0000-0000-0000-000000001801' limit 1;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001801","role":"authenticated"}', true);
select is(public.get_analytics_workspace('10000000-0000-0000-0000-000000001801', '2026-01-01', '2026-01-03')->>'timezone', 'America/New_York', 'Analytics returns the business timezone');
select is(public.get_analytics_workspace('10000000-0000-0000-0000-000000001801', '2026-01-01', '2026-01-03') #>> '{sales,daily_trend,0,recorded_sales}', '20.0000', 'Sales trend uses the business-local date');
select is(public.get_analytics_workspace('10000000-0000-0000-0000-000000001801', '2026-01-01', '2026-01-03') #>> '{purchasing,daily_trend,1,purchase_receipts}', '12.0000', 'Purchasing trend returns exact decimal strings');
select is(public.get_analytics_workspace('10000000-0000-0000-0000-000000001801', '2026-01-01', '2026-01-03') #>> '{finance,daily_trend,0,estimated_gross_profit}', '8.0000', 'Finance trend preserves estimated gross profit semantics');
select is(public.get_analytics_workspace('10000000-0000-0000-0000-000000001801', '2026-01-01', '2026-01-03') #>> '{finance,daily_trend,1,operating_expenses}', '3.0000', 'Finance trend returns recorded expenses on their business-local date');
select throws_like($$ select public.get_analytics_workspace('10000000-0000-0000-0000-000000001802', '2026-01-01', '2026-01-03') $$, '%Business is unavailable%', 'cross-business analytics access is denied');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001802","role":"authenticated"}', true);
select throws_like($$ select public.get_analytics_workspace('10000000-0000-0000-0000-000000001801', '2026-01-01', '2026-01-03') $$, '%Business is unavailable%', 'non-members cannot access analytics');
reset role;
select * from finish();
rollback;
