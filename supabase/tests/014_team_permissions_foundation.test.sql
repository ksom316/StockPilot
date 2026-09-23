begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000001401', 'authenticated', 'authenticated', 'team-owner@stockpilot.test', '', now(), '{}', '{"display_name":"Team Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000001402', 'authenticated', 'authenticated', 'team-manager@stockpilot.test', '', now(), '{}', '{"display_name":"Team Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000001403', 'authenticated', 'authenticated', 'team-employee@stockpilot.test', '', now(), '{}', '{"display_name":"Team Employee"}', now(), now()),
  ('00000000-0000-0000-0000-000000001404', 'authenticated', 'authenticated', 'team-cashier@stockpilot.test', '', now(), '{}', '{"display_name":"Team Cashier"}', now(), now()),
  ('00000000-0000-0000-0000-000000001405', 'authenticated', 'authenticated', 'team-inactive@stockpilot.test', '', now(), '{}', '{"display_name":"Inactive Manager"}', now(), now()),
  ('00000000-0000-0000-0000-000000001406', 'authenticated', 'authenticated', 'accept-one@stockpilot.test', '', now(), '{}', '{"display_name":"Accept One"}', now(), now()),
  ('00000000-0000-0000-0000-000000001407', 'authenticated', 'authenticated', 'wrong-account@stockpilot.test', '', now(), '{}', '{"display_name":"Wrong Account"}', now(), now()),
  ('00000000-0000-0000-0000-000000001408', 'authenticated', 'authenticated', 'expired-invite@stockpilot.test', '', now(), '{}', '{"display_name":"Expired Invite"}', now(), now()),
  ('00000000-0000-0000-0000-000000001409', 'authenticated', 'authenticated', 'other-owner@stockpilot.test', '', now(), '{}', '{"display_name":"Other Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000001410', 'authenticated', 'authenticated', 'unverified@stockpilot.test', '', null, '{}', '{"display_name":"Unverified"}', now(), now());

insert into public.businesses (id, name, currency, timezone, owner_user_id)
values
  ('10000000-0000-0000-0000-000000001401', 'Team Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001401'),
  ('10000000-0000-0000-0000-000000001402', 'Other Team Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001409'),
  ('10000000-0000-0000-0000-000000001403', 'Team Disabled Business', 'USD', 'UTC', '00000000-0000-0000-0000-000000001401');

insert into public.business_members (id, business_id, user_id, role, status)
values
  ('20000000-0000-0000-0000-000000001402', '10000000-0000-0000-0000-000000001401', '00000000-0000-0000-0000-000000001402', 'manager', 'active'),
  ('20000000-0000-0000-0000-000000001403', '10000000-0000-0000-0000-000000001401', '00000000-0000-0000-0000-000000001403', 'employee', 'active'),
  ('20000000-0000-0000-0000-000000001404', '10000000-0000-0000-0000-000000001401', '00000000-0000-0000-0000-000000001404', 'cashier', 'active'),
  ('20000000-0000-0000-0000-000000001405', '10000000-0000-0000-0000-000000001401', '00000000-0000-0000-0000-000000001405', 'manager', 'inactive');

update public.business_modules set enabled = true
where business_id in ('10000000-0000-0000-0000-000000001401', '10000000-0000-0000-0000-000000001402') and module = 'team';

set local role anon;
select throws_like(
  $$ select public.get_team_administration('10000000-0000-0000-0000-000000001401') $$,
  '%permission denied%',
  'anonymous callers cannot use Team administration'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001401","role":"authenticated"}', true);
select is(public.get_team_administration('10000000-0000-0000-0000-000000001401')->>'callerRole', 'owner', 'owner can view the Team directory');
select is(jsonb_array_length(public.get_team_administration('10000000-0000-0000-0000-000000001401')->'members'), 5, 'owner sees the scoped member roster');

select set_config('test.owner_manager_invite', public.create_team_invitation('10000000-0000-0000-0000-000000001401', ' New-Manager@StockPilot.Test ', 'manager')->>'invitationId', true);
select set_config('test.accept_invite', public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'ACCEPT-ONE@stockpilot.test', 'employee')->>'invitationId', true);
reset role;
select is((select email from public.team_invitations where id = current_setting('test.accept_invite')::uuid), 'accept-one@stockpilot.test', 'invitation email is normalized');
select is((select role::text from public.team_invitations where id = current_setting('test.owner_manager_invite')::uuid), 'manager', 'owner may invite a manager');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001401","role":"authenticated"}', true);
select lives_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'owner-cashier@stockpilot.test', 'cashier') $$, 'owner may invite a cashier');
select throws_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'owner-role@stockpilot.test', 'owner') $$, '42501', 'The invitation role is not allowed', 'owner cannot create another owner invitation');
select throws_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'accept-one@stockpilot.test', 'employee') $$, '23505', 'A pending invitation already exists for this email', 'duplicate pending invitation is rejected');
select throws_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'team-employee@stockpilot.test', 'cashier') $$, '23505', 'An active member already uses this invitation identity', 'active member cannot be invited again');
select ok(not (public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'safe-response@stockpilot.test', 'employee') ? 'token'), 'invitation response contains no bearer token');

select set_config('test.revoke_invite', public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'revoke-me@stockpilot.test', 'employee')->>'invitationId', true);
select is(public.revoke_team_invitation('10000000-0000-0000-0000-000000001401', current_setting('test.revoke_invite')::uuid)->>'status', 'revoked', 'owner can revoke a pending invitation');
reset role;
select is((select revoked_by::text from public.team_invitations where id = current_setting('test.revoke_invite')::uuid), '00000000-0000-0000-0000-000000001401', 'invitation revocation records its actor');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001401","role":"authenticated"}', true);
select throws_like($$ update public.business_members set role = 'manager' where id = '20000000-0000-0000-0000-000000001403' $$, '%permission denied%', 'direct membership mutation is unavailable');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001402","role":"authenticated"}', true);
select is(public.get_team_administration('10000000-0000-0000-0000-000000001401')->>'callerRole', 'manager', 'manager can view the Team directory');
select lives_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'manager-employee@stockpilot.test', 'employee') $$, 'manager may invite an employee');
select lives_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'manager-cashier@stockpilot.test', 'cashier') $$, 'manager may invite a cashier');
select throws_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'manager-manager@stockpilot.test', 'manager') $$, '42501', 'Managers may invite only employees or cashiers', 'manager cannot invite a manager');
select throws_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'manager-owner@stockpilot.test', 'owner') $$, '42501', 'The invitation role is not allowed', 'manager cannot invite an owner');
select is(public.change_team_member_role('10000000-0000-0000-0000-000000001401', '20000000-0000-0000-0000-000000001404', 'employee')->>'role', 'employee', 'manager may change cashier to employee');
select is(public.set_team_member_active('10000000-0000-0000-0000-000000001401', '20000000-0000-0000-0000-000000001404', false)->>'status', 'inactive', 'manager may deactivate an employee');
select is(public.set_team_member_active('10000000-0000-0000-0000-000000001401', '20000000-0000-0000-0000-000000001404', true)->>'status', 'active', 'manager may reactivate an employee');
select throws_ok($$ select public.change_team_member_role('10000000-0000-0000-0000-000000001401', '20000000-0000-0000-0000-000000001403', 'manager') $$, '42501', 'Managers may manage only employee and cashier roles', 'manager cannot promote an employee to manager');
select throws_ok($$ select public.set_team_member_active('10000000-0000-0000-0000-000000001401', (select id from public.business_members where business_id = '10000000-0000-0000-0000-000000001401' and role = 'owner'), false) $$, '42501', 'The owner membership cannot be deactivated', 'manager cannot deactivate the owner');
select throws_ok($$ select public.change_team_member_role('10000000-0000-0000-0000-000000001401', '20000000-0000-0000-0000-000000001402', 'owner') $$, '42501', 'You cannot change your own role', 'manager cannot self-escalate');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001403","role":"authenticated"}', true);
select throws_ok($$ select public.get_team_administration('10000000-0000-0000-0000-000000001401') $$, '42501', 'Team administration access is required', 'employee cannot administer Team');
select is((select count(*)::integer from public.business_members where business_id = '10000000-0000-0000-0000-000000001401'), 1, 'employee direct roster access is limited to self');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001404","role":"authenticated"}', true);
select throws_ok($$ select public.create_team_invitation('10000000-0000-0000-0000-000000001401', 'denied@stockpilot.test', 'cashier') $$, '42501', 'Team administration access is required', 'cashier cannot invite');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001405","role":"authenticated"}', true);
select throws_ok($$ select public.get_team_administration('10000000-0000-0000-0000-000000001401') $$, '42501', 'Team administration access is required', 'inactive manager cannot administer Team');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001401","role":"authenticated"}', true);
select throws_ok($$ select public.get_team_administration('10000000-0000-0000-0000-000000001402') $$, '42501', 'Team administration access is required', 'cross-business Team access is denied');
select throws_ok($$ select public.get_team_administration('10000000-0000-0000-0000-000000001403') $$, '42501', 'Team is not enabled for this business', 'Team-disabled business is denied');

select throws_ok($$ select public.change_team_member_role('10000000-0000-0000-0000-000000001401', (select id from public.business_members where business_id = '10000000-0000-0000-0000-000000001401' and role = 'owner'), 'manager') $$, '42501', 'You cannot change your own role', 'owner cannot change the owner membership');
select is(public.change_team_member_role('10000000-0000-0000-0000-000000001401', '20000000-0000-0000-0000-000000001403', 'manager')->>'role', 'manager', 'owner may promote an eligible member to manager');
reset role;
select is((select role_changed_by::text from public.business_members where id = '20000000-0000-0000-0000-000000001403'), '00000000-0000-0000-0000-000000001401', 'role change records its actor');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001401","role":"authenticated"}', true);
select is(public.set_team_member_active('10000000-0000-0000-0000-000000001401', '20000000-0000-0000-0000-000000001404', false)->>'status', 'inactive', 'owner may deactivate a non-owner');
select is(public.set_team_member_active('10000000-0000-0000-0000-000000001401', '20000000-0000-0000-0000-000000001404', true)->>'status', 'active', 'owner may reactivate a non-owner');
reset role;
select ok((select status_changed_at is not null and status_changed_by = '00000000-0000-0000-0000-000000001401' from public.business_members where id = '20000000-0000-0000-0000-000000001404'), 'status change records actor and timestamp');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001401","role":"authenticated"}', true);
select throws_ok($$ select public.set_team_member_active('10000000-0000-0000-0000-000000001401', (select id from public.business_members where business_id = '10000000-0000-0000-0000-000000001401' and role = 'owner'), false) $$, '42501', 'You cannot change your own membership status', 'last owner cannot be deactivated');

reset role;
insert into public.team_invitations (id, business_id, email, role, invited_by, created_at, expires_at)
values ('30000000-0000-0000-0000-000000001408', '10000000-0000-0000-0000-000000001401', 'expired-invite@stockpilot.test', 'employee', '00000000-0000-0000-0000-000000001401', now() - interval '2 days', now() - interval '1 day');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001407","role":"authenticated"}', true);
select throws_ok(format('select public.accept_team_invitation(%L)', current_setting('test.accept_invite')::uuid), '42501', 'Invitation does not belong to this account', 'wrong authenticated email cannot accept an invitation');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001406","role":"authenticated"}', true);
select is(public.accept_team_invitation(current_setting('test.accept_invite')::uuid)->>'status', 'active', 'matching verified account accepts invitation');
select is((select role::text from public.business_members where business_id = '10000000-0000-0000-0000-000000001401' and user_id = '00000000-0000-0000-0000-000000001406'), 'employee', 'accepted membership has exact invited role');
reset role;
select is((select status::text from public.team_invitations where id = current_setting('test.accept_invite')::uuid), 'accepted', 'accepted invitation has exact accepted status');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001408","role":"authenticated"}', true);
select throws_ok($$ select public.accept_team_invitation('30000000-0000-0000-0000-000000001408') $$, '42501', 'Invitation has expired', 'expired invitation cannot be accepted');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001410","role":"authenticated"}', true);
select throws_ok($$ select public.accept_team_invitation('30000000-0000-0000-0000-000000001408') $$, '42501', 'A verified account email is required', 'unverified email cannot accept an invitation');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001401","role":"authenticated"}', true);
select is((public.get_team_administration('10000000-0000-0000-0000-000000001401')->'invitations'->0 ? 'encrypted_password')::text, 'false', 'Team listing exposes no password fields');
select ok(position('raw_app_meta_data' in public.get_team_administration('10000000-0000-0000-0000-000000001401')::text) = 0, 'Team listing exposes no auth metadata');
reset role;
select is((select status::text from public.team_invitations where id = '30000000-0000-0000-0000-000000001408'), 'expired', 'listing deterministically marks elapsed invitations expired');

select * from finish();
rollback;
