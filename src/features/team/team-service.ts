import { supabase } from "@/lib/supabase"
import { TeamDataError, teamErrorMessage, type TeamAdministration, type TeamInvitation, type TeamMember, type TeamRole } from "./team-types"

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TeamDataError(`Team returned an invalid ${label}.`)
  return value as Record<string, unknown>
}
function stringValue(value: unknown, label: string): string { if (typeof value !== "string") throw new TeamDataError(`Team returned an invalid ${label}.`); return value }
function nullableString(value: unknown, label: string): string | null { if (value === null) return null; return stringValue(value, label) }
const roles = new Set<TeamRole>(["owner", "manager", "employee", "cashier"])
const memberStatuses = new Set(["active", "inactive", "suspended"])
const invitationStatuses = new Set(["pending", "accepted", "revoked", "expired"])

function parseMember(value: unknown): TeamMember {
  const item = record(value, "member"); const role = stringValue(item.role, "member.role"); const status = stringValue(item.status, "member.status")
  if (!roles.has(role as TeamRole) || !memberStatuses.has(status)) throw new TeamDataError("Team returned an invalid member role or status.")
  return { membershipId: stringValue(item.membershipId, "membershipId"), userId: stringValue(item.userId, "userId"), displayName: stringValue(item.displayName, "displayName"), email: nullableString(item.email, "email"), role: role as TeamRole, status: status as TeamMember["status"], createdAt: stringValue(item.createdAt, "createdAt"), updatedAt: stringValue(item.updatedAt, "updatedAt"), statusChangedAt: nullableString(item.statusChangedAt, "statusChangedAt") }
}
function parseInvitation(value: unknown): TeamInvitation {
  const item = record(value, "invitation"); const role = stringValue(item.role, "invitation.role"); const status = stringValue(item.status, "invitation.status")
  if (!roles.has(role as TeamRole) || role === "owner" || !invitationStatuses.has(status)) throw new TeamDataError("Team returned an invalid invitation role or status.")
  return { invitationId: stringValue(item.invitationId, "invitationId"), email: stringValue(item.email, "email"), role: role as TeamInvitation["role"], status: status as TeamInvitation["status"], invitedBy: stringValue(item.invitedBy, "invitedBy"), createdAt: stringValue(item.createdAt, "createdAt"), expiresAt: stringValue(item.expiresAt, "expiresAt"), acceptedAt: nullableString(item.acceptedAt, "acceptedAt"), revokedAt: nullableString(item.revokedAt, "revokedAt") }
}

export function parseTeamAdministration(value: unknown): TeamAdministration {
  const item = record(value, "administration"); const callerRole = stringValue(item.callerRole, "callerRole")
  if (item.schemaVersion !== 1 || callerRole !== "owner" && callerRole !== "manager" || !Array.isArray(item.members) || !Array.isArray(item.invitations)) throw new TeamDataError("Team returned an invalid administration response.")
  return { schemaVersion: 1, businessId: stringValue(item.businessId, "businessId"), callerRole, members: item.members.map(parseMember), invitations: item.invitations.map(parseInvitation) }
}

async function rpc<T>(name: string, args: Record<string, unknown>, parse: (value: unknown) => T): Promise<T> {
  if (!supabase) throw new TeamDataError("Team administration is not configured.")
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new TeamDataError(teamErrorMessage(error.code, error.code === "42501" ? 403 : undefined), error.code, error.code === "42501" ? 403 : undefined)
  return parse(data)
}

export function fetchTeamAdministration(businessId: string) { return rpc("get_team_administration", { p_business_id: businessId }, parseTeamAdministration) }
export function createTeamInvitation(businessId: string, email: string, role: Exclude<TeamRole, "owner">) { return rpc("create_team_invitation", { p_business_id: businessId, p_email: email, p_role: role }, (value) => record(value, "invitation result")) }
export function revokeTeamInvitation(businessId: string, invitationId: string) { return rpc("revoke_team_invitation", { p_business_id: businessId, p_invitation_id: invitationId }, (value) => record(value, "revocation result")) }
export function changeTeamMemberRole(businessId: string, membershipId: string, role: Exclude<TeamRole, "owner">) { return rpc("change_team_member_role", { p_business_id: businessId, p_membership_id: membershipId, p_role: role }, (value) => record(value, "role result")) }
export function setTeamMemberActive(businessId: string, membershipId: string, active: boolean) { return rpc("set_team_member_active", { p_business_id: businessId, p_membership_id: membershipId, p_active: active }, (value) => record(value, "status result")) }
export function acceptTeamInvitation(invitationId: string) { return rpc("accept_team_invitation", { p_invitation_id: invitationId }, (value) => record(value, "acceptance result")) }
