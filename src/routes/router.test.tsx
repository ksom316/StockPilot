import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { routes } from "@/routes/router"

vi.mock("@/features/inventory/inventory-queries", () => ({
  useInventoryMovements: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}))
import {
  createAuthValue,
  createBusinessValue,
  testBusiness,
  testMembership,
  testSession,
  testUser,
  TestAuthProvider,
  TestBusinessProvider,
} from "@/test/auth-test-utils"

function renderRoute(path: string, authOverrides = {}, businessOverrides = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <TestAuthProvider value={createAuthValue(authOverrides)}>
      <TestBusinessProvider value={createBusinessValue(businessOverrides)}>
        <RouterProvider router={router} />
      </TestBusinessProvider>
    </TestAuthProvider>,
  )
}

describe("authentication routes", () => {
  it("redirects an unauthenticated dashboard visit to sign in", async () => {
    renderRoute("/dashboard")
    expect(await screen.findByRole("heading", { name: /sign in to stockpilot/i })).toBeInTheDocument()
  })

  it("protects the inventory route", async () => {
    renderRoute("/inventory")
    expect(await screen.findByRole("heading", { name: /sign in to stockpilot/i })).toBeInTheDocument()
  })

  it("protects movement history and renders it for an authenticated business member", async () => {
    renderRoute("/inventory/movements", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "cashier", onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /movement history/i })).toBeInTheDocument()
  })

  it("redirects a signed-out onboarding visit to sign in", async () => {
    renderRoute("/onboarding")
    expect(await screen.findByRole("heading", { name: /sign in to stockpilot/i })).toBeInTheDocument()
  })

  it("renders the dashboard for an authenticated session", async () => {
    renderRoute("/dashboard", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
  })

  it("shows a neutral loading state while auth initializes", () => {
    renderRoute("/dashboard", { isLoading: true })
    expect(screen.getByRole("status")).toHaveTextContent(/restoring your session/i)
    expect(screen.queryByRole("heading", { name: /welcome to stockpilot/i })).not.toBeInTheDocument()
  })

  it("surfaces session initialization failures with a retry action", () => {
    renderRoute("/dashboard", { initializationError: "Session restore failed" })
    expect(screen.getByRole("alert")).toHaveTextContent("Session restore failed")
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /sign in to stockpilot/i })).not.toBeInTheDocument()
  })

  it("keeps dashboard and onboarding hidden while the business is resolving", () => {
    renderRoute("/dashboard", { session: testSession, user: testUser }, { isLoading: true })
    expect(screen.getByRole("status")).toHaveTextContent(/loading your workspace/i)
    expect(screen.queryByRole("heading", { name: /welcome to/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /set up your stockpilot workspace/i })).not.toBeInTheDocument()
  })

  it("redirects authenticated users away from sign in", async () => {
    renderRoute("/login", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
  })

  it("routes an authenticated user without a business to onboarding", async () => {
    renderRoute("/dashboard", { session: testSession, user: testUser })
    expect(await screen.findByRole("heading", { name: /set up your stockpilot workspace/i })).toBeInTheDocument()
  })

  it("prevents an onboarded user from repeating onboarding", async () => {
    renderRoute("/onboarding", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
  })

  it("shows only enabled optional modules in workspace navigation", async () => {
    renderRoute("/dashboard", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", enabledModules: ["sales"], onboardingRequired: false })
    const navigation = await screen.findByRole("navigation", { name: /workspace navigation/i })
    expect(navigation).toHaveTextContent("Inventory")
    expect(navigation).toHaveTextContent("Sales")
    expect(navigation).not.toHaveTextContent("Purchasing")
  })

  it("keeps Inventory available with no optional modules enabled", async () => {
    renderRoute("/dashboard", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", enabledModules: [], onboardingRequired: false })
    const navigation = await screen.findByRole("navigation", { name: /workspace navigation/i })
    expect(within(navigation).getByRole("link", { name: "Inventory" })).toHaveAttribute("href", "/inventory")
  })

  it("clears protected workspace access after sign-out", async () => {
    const user = userEvent.setup()
    function SignOutHarness() {
      const [signedIn, setSignedIn] = useState(true)
      return (
        <TestAuthProvider value={createAuthValue({
          session: signedIn ? testSession : null,
          user: signedIn ? testUser : null,
          signOut: async () => setSignedIn(false),
        })}>
          <TestBusinessProvider value={createBusinessValue({ business: testBusiness, membership: testMembership, role: "owner", onboardingRequired: false })}>
            <RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/dashboard"] })} />
          </TestBusinessProvider>
        </TestAuthProvider>
      )
    }

    render(<SignOutHarness />)
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /sign out/i }))
    expect(await screen.findByRole("heading", { name: /sign in to stockpilot/i })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: /welcome to northstar market/i })).not.toBeInTheDocument()
  })
})
