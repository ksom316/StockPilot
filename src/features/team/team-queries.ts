import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useBusiness } from "@/features/business/business-context"
import { acceptTeamInvitation, changeTeamMemberRole, createTeamInvitation, fetchTeamAdministration, revokeTeamInvitation, setTeamMemberActive } from "./team-service"
import type { TeamRole } from "./team-types"

export const teamKeys = { administration: (businessId: string) => ["team-administration", businessId] as const }
function canAdmin(role: string | null) { return role === "owner" || role === "manager" }

export function useTeamAdministration() {
  const { business, enabledModules, role } = useBusiness(); const businessId = business?.id ?? ""
  const enabled = Boolean(businessId && enabledModules.includes("team") && canAdmin(role))
  return useQuery({ queryKey: teamKeys.administration(businessId), queryFn: () => fetchTeamAdministration(businessId), enabled })
}

export function useTeamMutations() {
  const { business } = useBusiness(); const client = useQueryClient(); const businessId = business?.id ?? ""
  const invalidate = () => client.invalidateQueries({ queryKey: teamKeys.administration(businessId) })
  return {
    invite: useMutation({ mutationFn: ({ email, role }: { email: string; role: Exclude<TeamRole, "owner"> }) => createTeamInvitation(businessId, email, role), onSuccess: invalidate }),
    revoke: useMutation({ mutationFn: (invitationId: string) => revokeTeamInvitation(businessId, invitationId), onSuccess: invalidate }),
    changeRole: useMutation({ mutationFn: ({ membershipId, role }: { membershipId: string; role: Exclude<TeamRole, "owner"> }) => changeTeamMemberRole(businessId, membershipId, role), onSuccess: invalidate }),
    setActive: useMutation({ mutationFn: ({ membershipId, active }: { membershipId: string; active: boolean }) => setTeamMemberActive(businessId, membershipId, active), onSuccess: invalidate }),
  }
}

export function useAcceptTeamInvitation() { return useMutation({ mutationFn: acceptTeamInvitation }) }
