import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }))

import { createTeamInvitation, fetchTeamAdministration, parseTeamAdministration } from "./team-service"

const response = { schemaVersion: 1, businessId: "business-1", callerRole: "owner", members: [{ membershipId: "m1", userId: "u1", displayName: "Owner", email: "owner@example.com", role: "owner", status: "active", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", statusChangedAt: null }], invitations: [{ invitationId: "i1", email: "invite@example.com", role: "employee", status: "pending", invitedBy: "u1", createdAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-08T00:00:00Z", acceptedAt: null, revokedAt: null }] }

describe("team service", () => {
  beforeEach(() => mocks.rpc.mockReset())
  it("parses the exact Phase 12A administration contract", () => { expect(parseTeamAdministration(response)).toMatchObject({ businessId: "business-1", callerRole: "owner", members: [{ role: "owner", status: "active" }], invitations: [{ status: "pending", role: "employee" }] }) })
  it("uses RPCs and never writes membership tables directly", async () => { mocks.rpc.mockResolvedValue({ data: response, error: null }); await fetchTeamAdministration("business-1"); await createTeamInvitation("business-1", "invite@example.com", "employee"); expect(mocks.rpc).toHaveBeenNthCalledWith(1, "get_team_administration", { p_business_id: "business-1" }); expect(mocks.rpc).toHaveBeenNthCalledWith(2, "create_team_invitation", { p_business_id: "business-1", p_email: "invite@example.com", p_role: "employee" }) })
  it("surfaces duplicate invitation errors without backend details", async () => { mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "private database detail" } }); await expect(createTeamInvitation("business-1", "invite@example.com", "employee")).rejects.toMatchObject({ code: "23505", message: expect.stringContaining("pending invitation") }); await expect(createTeamInvitation("business-1", "invite@example.com", "employee")).rejects.not.toMatchObject({ message: expect.stringContaining("private database detail") }) })
})
