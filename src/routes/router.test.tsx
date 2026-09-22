import { render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { routes } from "@/routes/router"
import { createAuthValue, testSession, testUser, TestAuthProvider } from "@/test/auth-test-utils"

function renderRoute(path: string, overrides = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <TestAuthProvider value={createAuthValue(overrides)}>
      <RouterProvider router={router} />
    </TestAuthProvider>,
  )
}

describe("authentication routes", () => {
  it("redirects an unauthenticated dashboard visit to sign in", async () => {
    renderRoute("/dashboard")
    expect(await screen.findByRole("heading", { name: /sign in to stockpilot/i })).toBeInTheDocument()
  })

  it("renders the dashboard for an authenticated session", async () => {
    renderRoute("/dashboard", { session: testSession, user: testUser })
    expect(await screen.findByRole("heading", { name: /welcome to stockpilot/i })).toBeInTheDocument()
  })

  it("shows a neutral loading state while auth initializes", () => {
    renderRoute("/dashboard", { isLoading: true })
    expect(screen.getByRole("status")).toHaveTextContent(/restoring your session/i)
    expect(screen.queryByRole("heading", { name: /welcome to stockpilot/i })).not.toBeInTheDocument()
  })

  it("redirects authenticated users away from sign in", async () => {
    renderRoute("/login", { session: testSession, user: testUser })
    expect(await screen.findByRole("heading", { name: /welcome to stockpilot/i })).toBeInTheDocument()
  })
})
