export type TeamRole = "owner" | "manager" | "employee" | "cashier"
export type TeamMemberStatus = "active" | "inactive" | "suspended"
export type TeamInvitationStatus = "pending" | "accepted" | "revoked" | "expired"

export interface TeamMember {
  membershipId: string
  userId: string
  displayName: string
  email: string | null
  role: TeamRole
  status: TeamMemberStatus
  createdAt: string
  updatedAt: string
  statusChangedAt: string | null
}

export interface TeamInvitation {
  invitationId: string
  email: string
  role: Exclude<TeamRole, "owner">
  status: TeamInvitationStatus
  invitedBy: string
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

export interface TeamAdministration {
  schemaVersion: 1
  businessId: string
  callerRole: "owner" | "manager"
  members: TeamMember[]
  invitations: TeamInvitation[]
}

export class TeamDataError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) { super(message); this.name = "TeamDataError" }
}

export function teamErrorMessage(code?: string, status?: number) {
  if (status === 401 || code === "UNAUTHENTICATED") return "Your session is unavailable. Sign in again and retry."
  if (status === 403 || code === "42501" || code === "ACCESS_DENIED" || code === "MODULE_DISABLED") return "Team administration is unavailable for this workspace or your role."
  if (code === "23505") return "A pending invitation already exists or this email already belongs to an active member."
  if (code === "22023") return "Check the invitation email, role, and expiry details."
  return "Team data could not be updated. Please try again."
}
