begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001501', 'authenticated', 'authenticated', 'notify-owner@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001502', 'authenticated', 'authenticated', 'notify-employee@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001503', 'authenticated', 'authenticated', 'notify-other@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001504', 'authenticated', 'authenticated', 'notify-invitee@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001505', 'authenticated', 'authenticated', 'notify-cross-business@stockpilot.test', '', now(), '{}', '{}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values
  ('10000000-0000-0000-0000-000000001501', 'Notification Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001501'),
  ('10000000-0000-0000-0000-000000001502', 'Other Notification Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001505');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000001501', '00000000-0000-0000-0000-000000001502', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000001501', '00000000-0000-0000-0000-000000001503', 'employee', 'inactive');

update public.business_modules set enabled = true
where business_id = '10000000-0000-0000-0000-000000001501' and module = 'team';

insert into public.products (id, business_id, name, sku, current_quantity, low_stock_threshold)
values ('30000000-0000-0000-0000-000000001501', '10000000-0000-0000-0000-000000001501', 'Coffee Beans', 'NOTIFY-1', 5, 2);

insert into public.team_invitations (id, business_id, email, role, invited_by)
values ('40000000-0000-0000-0000-000000001501', '10000000-0000-0000-0000-000000001501', 'notify-invitee@stockpilot.test', 'employee', '00000000-0000-0000-0000-000000001501');

set local role anon;
select throws_like($$ select public.get_notifications('10000000-0000-0000-0000-000000001501') $$, '%permission denied%', 'anonymous notification access is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001501","role":"authenticated"}', true);
select is(jsonb_array_length(public.get_notifications('10000000-0000-0000-0000-000000001501')), 0, 'owner sees no unrelated initial notifications');
reset role;
update public.products set current_quantity = 2 where id = '30000000-0000-0000-0000-000000001501';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001501","role":"authenticated"}', true);
select is((public.get_notifications('10000000-0000-0000-0000-000000001501')->0)->>'notification_type', 'low_stock', 'low-stock notification is generated');
select is((select count(*)::integer from public.notifications where business_id = '10000000-0000-0000-0000-000000001501' and recipient_user_id = '00000000-0000-0000-0000-000000001501' and notification_type = 'low_stock'), 1, 'repeated synchronization is idempotent');
reset role;
update public.products set current_quantity = 0 where id = '30000000-0000-0000-0000-000000001501';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001501","role":"authenticated"}', true);
select is((select count(*)::integer from public.notifications where recipient_user_id = '00000000-0000-0000-0000-000000001501' and notification_type = 'out_of_stock' and read_at is null), 1, 'out-of-stock transition creates a distinct notification');
select ok((select read_at is not null from public.notifications where recipient_user_id = '00000000-0000-0000-0000-000000001501' and notification_type = 'low_stock'), 'previous low-stock alert is acknowledged on transition');
select is(public.mark_all_notifications_read('10000000-0000-0000-0000-000000001501'), 1, 'mark all reads remaining eligible notifications');
select ok(public.mark_notification_read((public.get_notifications('10000000-0000-0000-0000-000000001501')->0->>'id')::uuid), 'recipient can mark one notification read');
select is(public.mark_all_notifications_read('10000000-0000-0000-0000-000000001501'), 0, 'mark all is idempotent after all are read');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001504","role":"authenticated"}', true);
select is((public.get_notifications('10000000-0000-0000-0000-000000001501')->0)->>'notification_type', 'invitation_available', 'invitee sees only their own pending invitation notification');
select is((public.get_notifications('10000000-0000-0000-0000-000000001501')->0)->>'entity_id', '40000000-0000-0000-0000-000000001501', 'invitation notification exposes only its safe invitation reference');
select throws_ok($$ select public.get_notifications('10000000-0000-0000-0000-000000001502') $$, '42501', 'Business is unavailable', 'invitee cannot discover another business');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001503","role":"authenticated"}', true);
select throws_ok($$ select public.get_notifications('10000000-0000-0000-0000-000000001501') $$, '42501', 'Business is unavailable', 'inactive membership cannot read notifications');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001505","role":"authenticated"}', true);
select throws_ok($$ select public.get_notifications('10000000-0000-0000-0000-000000001501') $$, '42501', 'Business is unavailable', 'cross-business user cannot read notifications');
select throws_like($$ insert into public.notifications (business_id, recipient_user_id, notification_type, title, message, dedupe_key) values ('10000000-0000-0000-0000-000000001501', '00000000-0000-0000-0000-000000001501', 'low_stock', 'Forged', 'Forged', 'forged') $$, '%permission denied%', 'clients cannot forge system notifications');

select * from finish();
rollback;
