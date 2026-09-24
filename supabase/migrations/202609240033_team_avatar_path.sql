-- Include the same profile image metadata in the existing authorized Team RPC.
-- The RPC already limits the roster to the caller's active business.

create or replace function public.get_team_administration(p_business_id uuid)
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
    'avatarPath', profile.avatar_path,
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

revoke all on function public.get_team_administration(uuid) from public, anon;
grant execute on function public.get_team_administration(uuid) to authenticated;
