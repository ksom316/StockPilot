import { render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { routes } from "@/routes/router"
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

  it("renders the dashboard for an authenticated session", async () => {
    renderRoute("/dashboard", { session: testSession, user: testUser }, { business: testBusiness, membership: testMembership, role: "owner", onboardingRequired: false })
    expect(await screen.findByRole("heading", { name: /welcome to northstar market/i })).toBeInTheDocument()
  })

  it("shows a neutral loading state while auth initializes", () => {
    renderRoute("/dashboard", { isLoading: true })
    expect(screen.getByRole("status")).toHaveTextContent(/restoring your session/i)
    expect(screen.queryByRole("heading", { name: /welcome to stockpilot/i })).not.toBeInTheDocument()
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
})
