-- StockPilot Phase 12A: Team administration and authenticated email invitations.

create type public.team_invitation_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null,
  role public.business_role not null,
  status public.team_invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles (id) on delete restrict,
  accepted_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  constraint team_invitations_normalized_email_check
    check (email = lower(btrim(email)) and length(email) between 3 and 320),
  constraint team_invitations_email_shape_check
    check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint team_invitations_role_check check (role <> 'owner'),
  constraint team_invitations_expiry_check check (expires_at > created_at),
  constraint team_invitations_acceptance_check check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or (status <> 'accepted' and accepted_by is null and accepted_at is null)
  ),
  constraint team_invitations_revocation_check check (
    (status = 'revoked' and revoked_by is not null and revoked_at is not null)
    or (status <> 'revoked' and revoked_by is null and revoked_at is null)
  )
);

create unique index team_invitations_one_pending_email_idx
  on public.team_invitations (business_id, email)
  where status = 'pending';

create index team_invitations_business_created_idx
  on public.team_invitations (business_id, created_at desc);

alter table public.business_members
  add column invited_by uuid references public.profiles (id) on delete set null,
  add column role_changed_by uuid references public.profiles (id) on delete set null,
  add column status_changed_by uuid references public.profiles (id) on delete set null,
  add column status_changed_at timestamptz;

alter table public.team_invitations enable row level security;

revoke all on table public.team_invitations from public, anon, authenticated;
revoke insert, update, delete on table public.business_members from authenticated;

drop policy if exists business_members_select_active_member on public.business_members;
drop policy if exists business_members_insert_owner on public.business_members;
drop policy if exists business_members_update_owner on public.business_members;
drop policy if exists business_members_delete_owner on public.business_members;

create function private.can_view_team(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members as member
    join public.business_modules as module
      on module.business_id = member.business_id
     and module.module = 'team'
     and module.enabled
    where member.business_id = p_business_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role in ('owner', 'manager')
  );
$$;

revoke all on function private.can_view_team(uuid) from public, anon, authenticated;
grant execute on function private.can_view_team(uuid) to authenticated;

create policy business_members_select_self_or_team_admin
on public.business_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.can_view_team(business_id))
);

create function private.require_team_admin(p_business_id uuid)
returns public.business_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.business_role;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select member.role
  into v_role
  from public.business_members as member
  where member.business_id = p_business_id
    and member.user_id = v_user_id
    and member.status = 'active';

  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Team administration access is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.business_modules as module
    where module.business_id = p_business_id
      and module.module = 'team'
      and module.enabled
  ) then
    raise exception 'Team is not enabled for this business' using errcode = '42501';
  end if;

  return v_role;
end;
$$;

revoke all on function private.require_team_admin(uuid) from public, anon, authenticated;
grant execute on function private.require_team_admin(uuid) to authenticated;

create function public.get_team_administration(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.business_role;
  v_members jsonb;
  v_invitations jsonb;
begin
  v_role := private.require_team_admin(p_business_id);

  update public.team_invitations
  set status = 'expired'
  where business_id = p_business_id
    and status = 'pending'
    and expires_at <= now();

  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId', member.id,
    'userId', member.user_id,
    'displayName', profile.display_name,
    'email', lower(auth_user.email),
    'role', member.role,
    'status', member.status,
    'createdAt', member.created_at,
    'updatedAt', member.updated_at,
    'statusChangedAt', member.status_changed_at
  ) order by case member.role when 'owner' then 1 when 'manager' then 2 when 'employee' then 3 else 4 end,
    lower(profile.display_name), member.id), '[]'::jsonb)
  into v_members
  from public.business_members as member
  join public.profiles as profile on profile.id = member.user_id
  join auth.users as auth_user on auth_user.id = member.user_id
  where member.business_id = p_business_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invitationId', invitation.id,
    'email', invitation.email,
    'role', invitation.role,
    'status', invitation.status,
    'invitedBy', invitation.invited_by,
    'createdAt', invitation.created_at,
    'expiresAt', invitation.expires_at,
    'acceptedAt', invitation.accepted_at,
    'revokedAt', invitation.revoked_at
  ) order by invitation.created_at desc, invitation.id), '[]'::jsonb)
  into v_invitations
  from public.team_invitations as invitation
  where invitation.business_id = p_business_id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'businessId', p_business_id,
    'callerRole', v_role,
    'members', v_members,
    'invitations', v_invitations
  );
end;
$$;

create function public.create_team_invitation(
  p_business_id uuid,
  p_email text,
  p_role public.business_role,
  p_expires_at timestamptz default (now() + interval '7 days')
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role public.business_role;
  v_email text := lower(btrim(p_email));
  v_invitation public.team_invitations%rowtype;
begin
  perform 1 from public.businesses where id = p_business_id for update;
  v_actor_role := private.require_team_admin(p_business_id);

  if v_email is null or length(v_email) not between 3 and 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid invitation email is required' using errcode = '22023';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'The invitation role is not allowed' using errcode = '42501';
  end if;
  if v_actor_role = 'manager' and p_role not in ('employee', 'cashier') then
    raise exception 'Managers may invite only employees or cashiers' using errcode = '42501';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'Invitation expiry must be within the next 30 days' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text || ':' || v_email, 0));
  update public.team_invitations set status = 'expired'
  where business_id = p_business_id and email = v_email and status = 'pending' and expires_at <= now();

  if exists (
    select 1
    from public.business_members as member
    join auth.users as auth_user on auth_user.id = member.user_id
    where member.business_id = p_business_id
      and member.status = 'active'
      and lower(auth_user.email) = v_email
  ) then
    raise exception 'An active member already uses this invitation identity' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.team_invitations
    where business_id = p_business_id and email = v_email and status = 'pending'
  ) then
    raise exception 'A pending invitation already exists for this email' using errcode = '23505';
  end if;

  insert into public.team_invitations (business_id, email, role, invited_by, expires_at)
  values (p_business_id, v_email, p_role, v_user_id, p_expires_at)
  returning * into v_invitation;

  return jsonb_build_object('invitationId', v_invitation.id, 'businessId', v_invitation.business_id,
    'email', v_invitation.email, 'role', v_invitation.role, 'status', v_invitation.status,
    'createdAt', v_invitation.created_at, 'expiresAt', v_invitation.expires_at);
end;
$$;

create function public.accept_team_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_invitation public.team_invitations%rowtype;
  v_membership public.business_members%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select lower(email) into v_email
  from auth.users
  where id = v_user_id and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'A verified account email is required' using errcode = '42501';
  end if;

  select * into v_invitation from public.team_invitations
  where id = p_invitation_id for update;
  if not found then
    raise exception 'Invitation is unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.business_modules where business_id = v_invitation.business_id and module = 'team' and enabled) then
    raise exception 'Team is not enabled for this business' using errcode = '42501';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending' using errcode = '42501';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception 'Invitation has expired' using errcode = '42501';
  end if;
  if v_invitation.email <> v_email then
    raise exception 'Invitation does not belong to this account' using errcode = '42501';
  end if;
  if exists (select 1 from public.business_members where business_id = v_invitation.business_id and user_id = v_user_id and status = 'active') then
    raise exception 'An active membership already exists' using errcode = '23505';
  end if;

  insert into public.business_members (business_id, user_id, role, status, invited_by, role_changed_by, status_changed_by, status_changed_at)
  values (v_invitation.business_id, v_user_id, v_invitation.role, 'active', v_invitation.invited_by,
    v_invitation.invited_by, v_user_id, now())
  on conflict (business_id, user_id) do update
  set role = excluded.role, status = 'active', invited_by = excluded.invited_by,
      role_changed_by = excluded.role_changed_by, status_changed_by = excluded.status_changed_by,
      status_changed_at = excluded.status_changed_at
  returning * into v_membership;

  update public.team_invitations
  set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  where id = v_invitation.id;

  return jsonb_build_object('membershipId', v_membership.id, 'businessId', v_membership.business_id,
    'userId', v_membership.user_id, 'role', v_membership.role, 'status', v_membership.status);
end;
$$;

create function public.revoke_team_invitation(p_business_id uuid, p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role public.business_role;
  v_invitation public.team_invitations%rowtype;
begin
  perform 1 from public.businesses where id = p_business_id for update;
  v_actor_role := private.require_team_admin(p_business_id);
  select * into v_invitation from public.team_invitations
  where id = p_invitation_id and business_id = p_business_id for update;
  if not found or v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception 'Pending invitation is unavailable' using errcode = '42501';
  end if;
  if v_actor_role = 'manager' and v_invitation.role not in ('employee', 'cashier') then
    raise exception 'Managers cannot revoke this invitation' using errcode = '42501';
  end if;
  update public.team_invitations
  set status = 'revoked', revoked_by = v_user_id, revoked_at = now()
  where id = v_invitation.id
  returning * into v_invitation;
  return jsonb_build_object('invitationId', v_invitation.id, 'status', v_invitation.status,
    'revokedAt', v_invitation.revoked_at);
end;
$$;

create function public.change_team_member_role(
  p_business_id uuid,
  p_membership_id uuid,
  p_role public.business_role
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role public.business_role;
  v_member public.business_members%rowtype;
begin
  perform 1 from public.businesses where id = p_business_id for update;
  v_actor_role := private.require_team_admin(p_business_id);
  select * into v_member from public.business_members
  where id = p_membership_id and business_id = p_business_id for update;
  if not found then raise exception 'Team member is unavailable' using errcode = '42501'; end if;
  if v_member.user_id = v_user_id then raise exception 'You cannot change your own role' using errcode = '42501'; end if;
  if v_member.role = 'owner' or p_role = 'owner' then raise exception 'Owner role changes require ownership transfer' using errcode = '42501'; end if;
  if v_actor_role = 'manager' and (v_member.role not in ('employee', 'cashier') or p_role not in ('employee', 'cashier')) then
    raise exception 'Managers may manage only employee and cashier roles' using errcode = '42501';
  end if;
  update public.business_members set role = p_role, role_changed_by = v_user_id
  where id = v_member.id returning * into v_member;
  return jsonb_build_object('membershipId', v_member.id, 'userId', v_member.user_id,
    'role', v_member.role, 'status', v_member.status);
end;
$$;

create function public.set_team_member_active(
  p_business_id uuid,
  p_membership_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_role public.business_role;
  v_member public.business_members%rowtype;
  v_status public.membership_status;
begin
  if p_active is null then raise exception 'Member active state is required' using errcode = '22023'; end if;
  perform 1 from public.businesses where id = p_business_id for update;
  v_actor_role := private.require_team_admin(p_business_id);
  select * into v_member from public.business_members
  where id = p_membership_id and business_id = p_business_id for update;
  if not found then raise exception 'Team member is unavailable' using errcode = '42501'; end if;
  if v_member.user_id = v_user_id then raise exception 'You cannot change your own membership status' using errcode = '42501'; end if;
  if v_member.role = 'owner' then raise exception 'The owner membership cannot be deactivated' using errcode = '42501'; end if;
  if v_actor_role = 'manager' and v_member.role not in ('employee', 'cashier') then
    raise exception 'Managers may manage only employees and cashiers' using errcode = '42501';
  end if;
  v_status := case when p_active then 'active'::public.membership_status else 'inactive'::public.membership_status end;
  update public.business_members
  set status = v_status, status_changed_by = v_user_id, status_changed_at = now()
  where id = v_member.id returning * into v_member;
  return jsonb_build_object('membershipId', v_member.id, 'userId', v_member.user_id,
    'role', v_member.role, 'status', v_member.status, 'statusChangedAt', v_member.status_changed_at);
end;
$$;

revoke all on function public.get_team_administration(uuid) from public, anon;
revoke all on function public.create_team_invitation(uuid, text, public.business_role, timestamptz) from public, anon;
revoke all on function public.accept_team_invitation(uuid) from public, anon;
revoke all on function public.revoke_team_invitation(uuid, uuid) from public, anon;
revoke all on function public.change_team_member_role(uuid, uuid, public.business_role) from public, anon;
revoke all on function public.set_team_member_active(uuid, uuid, boolean) from public, anon;

grant execute on function public.get_team_administration(uuid) to authenticated;
grant execute on function public.create_team_invitation(uuid, text, public.business_role, timestamptz) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.revoke_team_invitation(uuid, uuid) to authenticated;
grant execute on function public.change_team_member_role(uuid, uuid, public.business_role) to authenticated;
grant execute on function public.set_team_member_active(uuid, uuid, boolean) to authenticated;

comment on table public.team_invitations is
  'Business-scoped authenticated-email invitations. No bearer token or email delivery is implemented in Phase 12A.';
comment on function public.get_team_administration(uuid) is
  'Owner/manager Team directory and invitation listing with minimal profile fields; requires enabled Team module.';
comment on function public.accept_team_invitation(uuid) is
  'Accepts a pending invitation only when its normalized email matches the authenticated user verified email.';
