import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { useState } from "react"

import { routes } from "@/routes/router"

vi.mock("@/features/inventory/inventory-queries", () => ({
  useInventoryMovements: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useInventoryProducts: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock("@/features/sales/sales-queries", () => ({
  useRecordSale: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSalesHistory: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useSaleDetail: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock("@/features/purchasing/purchasing-queries", () => ({
  usePurchasingSuppliers: () => ({ data: [], isLoading: false, isError: false }),
  useRecordPurchase: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

  it("requires authentication for module settings and gives cashiers read-only access", async () => {
    renderRoute("/settings/modules")
    expect(await screen.findByRole("heading", { name: /sign in to stockpilot/i })).toBeInTheDocument()
    renderRoute("/settings/modules", { session: testSession, user: testUser }, { business: testBusiness, membership: { ...testMembership, role: "cashier" }, role: "cashier", onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: "Modules" })).toBeInTheDocument()
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
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
    expect(within(navigation).getByRole("link", { name: "Sales" })).toHaveAttribute("href", "/sales")
  })

  it.each(["owner", "manager", "employee"] as const)("shows Purchasing and allows %s to receive stock when enabled", async (role) => {
    renderRoute("/purchasing", { session: testSession, user: testUser }, { business: testBusiness, membership: { ...testMembership, role }, role, enabledModules: ["purchasing"], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /receive stock/i })).toBeInTheDocument()
    const navigation = screen.getByRole("navigation", { name: /workspace navigation/i })
    expect(within(navigation).getByRole("link", { name: "Purchasing" })).toHaveAttribute("href", "/purchasing")
    expect(navigation).not.toHaveTextContent("Soon")
  })

  it("hides Purchasing when disabled and denies cashier workspace access", async () => {
    renderRoute("/dashboard", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", enabledModules: [], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
    expect(within(screen.getByRole("navigation", { name: /workspace navigation/i })).queryByRole("link", { name: "Purchasing" })).not.toBeInTheDocument()
    cleanup()
    renderRoute("/purchasing", { session: testSession, user: testUser }, { business: testBusiness, membership: { ...testMembership, role: "cashier" }, role: "cashier", enabledModules: ["purchasing"], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
    const navigation = screen.getByRole("navigation", { name: /workspace navigation/i })
    expect(within(navigation).queryByRole("link", { name: "Purchasing" })).not.toBeInTheDocument()
  })

  it.each(["owner", "manager", "employee", "cashier"] as const)("allows %s to reach Sales when enabled", async (role) => {
    renderRoute("/sales", { session: testSession, user: testUser }, { business: testBusiness, membership: { ...testMembership, role }, role, enabledModules: ["sales"], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: "New sale" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /stock in|stock out|adjust stock/i })).not.toBeInTheDocument()
  })

  it("redirects direct Sales access when the module is disabled", async () => {
    renderRoute("/sales", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", enabledModules: [], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
    const navigation = screen.getByRole("navigation", { name: /workspace navigation/i })
    expect(within(navigation).queryByRole("link", { name: "Sales" })).not.toBeInTheDocument()
  })

  it.each(["owner", "manager", "employee", "cashier"] as const)("allows %s to view Sales history when enabled", async (role) => {
    renderRoute("/sales/history", { session: testSession, user: testUser }, { business: testBusiness, membership: { ...testMembership, role }, role, enabledModules: ["sales"], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /sales history/i })).toBeInTheDocument()
  })

  it("keeps Sales history inaccessible when Sales is disabled", async () => {
    renderRoute("/sales/history", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", enabledModules: [], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
  })

  it.each(["owner", "manager", "employee", "cashier"] as const)("allows %s to open the guarded sale-detail route", async (role) => {
    renderRoute("/sales/sale-id", { session: testSession, user: testUser }, { business: testBusiness, membership: { ...testMembership, role }, role, enabledModules: ["sales"], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /sale unavailable/i })).toBeInTheDocument()
  })

  it("keeps direct sale-detail access unavailable when Sales is disabled", async () => {
    renderRoute("/sales/sale-id", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", enabledModules: [], onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
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
