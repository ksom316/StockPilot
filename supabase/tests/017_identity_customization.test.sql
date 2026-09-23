begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001701', 'authenticated', 'authenticated', 'identity-owner@stockpilot.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000001702', 'authenticated', 'authenticated', 'identity-member@stockpilot.test', '', now(), '{}', '{}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values ('10000000-0000-0000-0000-000000001701', 'Identity Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001701');
insert into public.business_members (id, business_id, user_id, role, status)
values ('20000000-0000-0000-0000-000000001702', '10000000-0000-0000-0000-000000001701', '00000000-0000-0000-0000-000000001702', 'employee', 'active');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001701","role":"authenticated"}', true);
select is((select avatar_id from public.profiles where id = '00000000-0000-0000-0000-000000001701'), 'user', 'profiles default to the safe fallback avatar');
select lives_ok($$ update public.profiles set avatar_id = 'leaf' where id = '00000000-0000-0000-0000-000000001701' $$, 'a user can update their own avatar');
select is((select avatar_id from public.profiles where id = '00000000-0000-0000-0000-000000001701'), 'leaf', 'the selected avatar is persisted');
select throws_like($$ update public.profiles set avatar_id = 'not-safe' where id = '00000000-0000-0000-0000-000000001701' $$, '%profiles_avatar_id_check%', 'arbitrary avatar identifiers are rejected');
select lives_ok($$ update public.businesses set icon_id = 'warehouse' where id = '10000000-0000-0000-0000-000000001701' $$, 'the business owner can update the business icon');
select is((select icon_id from public.businesses where id = '10000000-0000-0000-0000-000000001701'), 'warehouse', 'the selected business icon is persisted');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001702","role":"authenticated"}', true);
select lives_ok($$ update public.businesses set icon_id = 'landmark' where id = '10000000-0000-0000-0000-000000001701' $$, 'a non-owner update is safely ignored by RLS');
select is((select icon_id from public.businesses where id = '10000000-0000-0000-0000-000000001701'), 'warehouse', 'non-owners cannot change the business icon');
reset role;
select * from finish();
rollback;
