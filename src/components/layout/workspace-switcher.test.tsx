import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"
import { TestAuthProvider, TestBusinessProvider, createAuthValue, createBusinessValue, testBusiness, testMembership, testSession, testUser } from "@/test/auth-test-utils"

describe("WorkspaceSwitcher", () => {
  it("shows accessible workspaces and switches the active workspace", async () => {
    const user = userEvent.setup()
    const switchBusiness = vi.fn().mockResolvedValue(undefined)
    render(<MemoryRouter><TestAuthProvider value={createAuthValue({ session: testSession, user: testUser })}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, membership: testMembership, role: "owner", businesses: [{ ...testBusiness, membershipId: testMembership.id, role: "owner" }, { ...testBusiness, id: "business-2", name: "Second Workspace", membershipId: "membership-2", role: "employee" }], switchBusiness })}><WorkspaceSwitcher /></TestBusinessProvider></TestAuthProvider></MemoryRouter>)
    await user.click(screen.getByRole("button", { name: /current workspace/i }))
    expect(screen.getByRole("menuitemradio", { name: /second workspace/i })).toHaveTextContent("employee")
    await user.click(screen.getByRole("menuitemradio", { name: /second workspace/i }))
    expect(switchBusiness).toHaveBeenCalledWith("business-2")
  })

  it("exposes creation from the workspace menu", async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TestAuthProvider value={createAuthValue({ session: testSession, user: testUser })}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, membership: testMembership, businesses: [{ ...testBusiness, membershipId: testMembership.id, role: "owner" }] })}><WorkspaceSwitcher collapsed /></TestBusinessProvider></TestAuthProvider></MemoryRouter>)
    await user.click(screen.getByRole("button", { name: /current workspace/i }))
    expect(screen.getByRole("menuitem", { name: /create business/i })).toHaveAttribute("href", "/businesses/new")
  })
})
