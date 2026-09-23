import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { LoginPage } from "@/pages/login-page"
import { createAuthValue, TestAuthProvider } from "@/test/auth-test-utils"

describe("LoginPage", () => {
  it("validates required credentials before submission", async () => {
    const user = userEvent.setup()
    const signIn = vi.fn()
    render(
      <TestAuthProvider value={createAuthValue({ signIn })}>
        <MemoryRouter><LoginPage /></MemoryRouter>
      </TestAuthProvider>,
    )

    await user.click(screen.getByRole("button", { name: /sign in/i }))

    expect(screen.getByText("Enter your email address.")).toBeInTheDocument()
    expect(screen.getByText("Enter your password.")).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it("links to password recovery", () => {
    render(
      <TestAuthProvider value={createAuthValue()}>
        <MemoryRouter><LoginPage /></MemoryRouter>
      </TestAuthProvider>,
    )

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password")
  })
})
