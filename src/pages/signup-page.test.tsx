import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { SignupPage } from "@/pages/signup-page"
import { createAuthValue, TestAuthProvider } from "@/test/auth-test-utils"

function renderSignup(signUp = vi.fn()) {
  render(
    <TestAuthProvider value={createAuthValue({ signUp })}>
      <MemoryRouter><SignupPage /></MemoryRouter>
    </TestAuthProvider>,
  )
  return signUp
}

describe("SignupPage", () => {
  it("shows required field and password length validation", async () => {
    const user = userEvent.setup()
    const signUp = renderSignup()

    await user.click(screen.getByRole("button", { name: /create account/i }))

    expect(screen.getByText("Enter your full name.")).toBeInTheDocument()
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument()
    expect(screen.getByText("Create a password.")).toBeInTheDocument()
    expect(signUp).not.toHaveBeenCalled()
  })

  it("rejects mismatched passwords before calling Supabase", async () => {
    const user = userEvent.setup()
    const signUp = renderSignup()

    await user.type(screen.getByLabelText(/full name/i), "Alex Morgan")
    await user.type(screen.getByLabelText(/^email$/i), "alex@example.com")
    await user.type(screen.getByLabelText(/^password$/i), "password-one")
    await user.type(screen.getByLabelText(/confirm password/i), "password-two")
    await user.click(screen.getByRole("button", { name: /create account/i }))

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument()
    expect(signUp).not.toHaveBeenCalled()
  })

  it("shows the confirmation state when no session is returned", async () => {
    const user = userEvent.setup()
    const signUp = vi.fn().mockResolvedValue({ confirmationRequired: true, email: "alex@example.com" })
    renderSignup(signUp)

    await user.type(screen.getByLabelText(/full name/i), "Alex Morgan")
    await user.type(screen.getByLabelText(/^email$/i), "alex@example.com")
    await user.type(screen.getByLabelText(/^password$/i), "password-one")
    await user.type(screen.getByLabelText(/confirm password/i), "password-one")
    await user.click(screen.getByRole("button", { name: /create account/i }))

    expect(await screen.findByRole("heading", { name: /check your email/i })).toBeInTheDocument()
    expect(screen.getByText("alex@example.com")).toBeInTheDocument()
  })
})
