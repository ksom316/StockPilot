begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000002801', 'authenticated', 'authenticated', 'media-owner@stockpilot.test', '', now(), '{}', '{"display_name":"Media Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000002802', 'authenticated', 'authenticated', 'media-employee@stockpilot.test', '', now(), '{}', '{"display_name":"Media Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000002803', 'authenticated', 'authenticated', 'media-other@stockpilot.test', '', now(), '{}', '{"display_name":"Other Owner"}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values
  ('10000000-0000-0000-0000-000000002801', 'Media Business A', 'USD', 'UTC', '00000000-0000-0000-0000-000000002801'),
  ('10000000-0000-0000-0000-000000002802', 'Media Business B', 'USD', 'UTC', '00000000-0000-0000-0000-000000002803');

insert into public.business_members (business_id, user_id, role, status)
values
  ('10000000-0000-0000-0000-000000002801', '00000000-0000-0000-0000-000000002802', 'employee', 'active'),
  ('10000000-0000-0000-0000-000000002802', '00000000-0000-0000-0000-000000002801', 'employee', 'active');

select is((select public from storage.buckets where id = 'branding'), true, 'branding bucket is public-read only');
select is((select file_size_limit from storage.buckets where id = 'branding'), 5242880::bigint, 'branding bucket enforces the five MB maximum');
select ok((select allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[] from storage.buckets where id = 'branding'), 'branding bucket allowlists supported image formats');
select ok((select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), 'storage object RLS is enabled');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_objects_public_read'), 1::bigint, 'branding objects have an explicit public read policy');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_objects_insert_own_scope'), 1::bigint, 'branding inserts have a narrow scope policy');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_objects_update_own_scope'), 1::bigint, 'branding updates have a narrow scope policy');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_objects_delete_own_scope'), 1::bigint, 'branding deletes have a narrow scope policy');
select ok((select with_check::text like '%is_business_owner%' from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'branding_objects_insert_own_scope'), 'business logo inserts use the existing owner authorization helper');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002801","role":"authenticated"}', true);

select lives_ok($$ update public.profiles
  set avatar_path = 'profiles/00000000-0000-0000-0000-000000002801/11111111-1111-1111-1111-111111111111.png'
  where id = '00000000-0000-0000-0000-000000002801' $$, 'a user can attach their own profile image path');
select is((select avatar_path from public.profiles where id = '00000000-0000-0000-0000-000000002801'), 'profiles/00000000-0000-0000-0000-000000002801/11111111-1111-1111-1111-111111111111.png', 'profile image metadata is persisted as a path');
select is((select avatar_path from public.profiles where id = '00000000-0000-0000-0000-000000002802'), null, 'another user profile starts without an image');
select lives_ok($$ update public.profiles
  set avatar_path = 'profiles/00000000-0000-0000-0000-000000002801/22222222-2222-2222-2222-222222222222.webp'
  where id = '00000000-0000-0000-0000-000000002801' $$, 'profile replacement updates metadata to a new versioned path');
select throws_like($$ update public.profiles
  set avatar_path = 'profiles/00000000-0000-0000-0000-000000002801/not-an-image.gif'
  where id = '00000000-0000-0000-0000-000000002801' $$, '%profiles_avatar_path_check%', 'unsupported profile object paths are rejected');
select lives_ok($$ update public.profiles set avatar_path = null where id = '00000000-0000-0000-0000-000000002801' $$, 'profile removal clears metadata');
select is((select avatar_path from public.profiles where id = '00000000-0000-0000-0000-000000002801'), null, 'profile fallback is restored after removal');
select lives_ok($$ update public.profiles
  set avatar_path = 'profiles/00000000-0000-0000-0000-000000002801/33333333-3333-3333-3333-333333333333.jpg'
  where id = '00000000-0000-0000-0000-000000002802' $$, 'cross-user profile updates affect zero rows rather than another user');
select is((select avatar_path from public.profiles where id = '00000000-0000-0000-0000-000000002802'), null, 'a user cannot modify another user profile image metadata');

select lives_ok($$ update public.businesses
  set logo_path = 'businesses/10000000-0000-0000-0000-000000002801/44444444-4444-4444-4444-444444444444.png'
  where id = '10000000-0000-0000-0000-000000002801' $$, 'an authorized business owner can upload a business logo');
select is((select logo_path from public.businesses where id = '10000000-0000-0000-0000-000000002801'), 'businesses/10000000-0000-0000-0000-000000002801/44444444-4444-4444-4444-444444444444.png', 'business logo metadata is persisted');
select lives_ok($$ update public.businesses
  set logo_path = 'businesses/10000000-0000-0000-0000-000000002801/55555555-5555-5555-5555-555555555555.webp'
  where id = '10000000-0000-0000-0000-000000002801' $$, 'business logo replacement uses a new versioned path');
select lives_ok($$ update public.businesses
  set logo_path = null
  where id = '10000000-0000-0000-0000-000000002801' $$, 'an owner can remove a business logo');
select is((select logo_path from public.businesses where id = '10000000-0000-0000-0000-000000002801'), null, 'business logo fallback is restored after removal');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002802","role":"authenticated"}', true);
select lives_ok($$ update public.businesses
  set logo_path = 'businesses/10000000-0000-0000-0000-000000002801/77777777-7777-7777-7777-777777777777.jpg'
  where id = '10000000-0000-0000-0000-000000002801' $$, 'an unauthorized role cannot modify a business logo');
select is((select logo_path from public.businesses where id = '10000000-0000-0000-0000-000000002801'), null, 'unauthorized logo update leaves metadata unchanged');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002803","role":"authenticated"}', true);
select lives_ok($$ update public.businesses
  set logo_path = 'businesses/10000000-0000-0000-0000-000000002802/66666666-6666-6666-6666-666666666666.png'
  where id = '10000000-0000-0000-0000-000000002802' $$, 'the owner can upload the logo for their own second business');
select is((select logo_path from public.businesses where id = '10000000-0000-0000-0000-000000002802'), 'businesses/10000000-0000-0000-0000-000000002802/66666666-6666-6666-6666-666666666666.png', 'the second business keeps its own logo');
select lives_ok($$ update public.businesses
  set logo_path = 'businesses/10000000-0000-0000-0000-000000002802/88888888-8888-8888-8888-888888888888.jpg'
  where id = '10000000-0000-0000-0000-000000002801' $$, 'a business owner cannot modify another business logo');
select is((select logo_path from public.businesses where id = '10000000-0000-0000-0000-000000002801'), null, 'cross-business logo update leaves metadata unchanged');

reset role;
select * from finish();
rollback;
