import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { ResetPasswordPage } from "@/pages/reset-password-page"
import { createAuthValue, testSession, TestAuthProvider } from "@/test/auth-test-utils"

function renderPage(overrides = {}) {
  return render(
    <TestAuthProvider value={createAuthValue({ session: testSession, user: testSession.user, ...overrides })}>
      <MemoryRouter><ResetPasswordPage /></MemoryRouter>
    </TestAuthProvider>,
  )
}

describe("ResetPasswordPage", () => {
  it("rejects mismatched passwords", async () => {
    const user = userEvent.setup()
    const updatePassword = vi.fn()
    renderPage({ updatePassword })

    await user.type(screen.getByLabelText("New password"), "new-password")
    await user.type(screen.getByLabelText("Confirm new password"), "different-password")
    await user.click(screen.getByRole("button", { name: /update password/i }))

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument()
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it("updates the password and signs out to provide a safe sign-in path", async () => {
    const user = userEvent.setup()
    const updatePassword = vi.fn().mockResolvedValue(undefined)
    const signOut = vi.fn().mockResolvedValue(undefined)
    renderPage({ updatePassword, signOut })

    await user.type(screen.getByLabelText("New password"), "new-password")
    await user.type(screen.getByLabelText("Confirm new password"), "new-password")
    await user.click(screen.getByRole("button", { name: /update password/i }))

    expect(updatePassword).toHaveBeenCalledWith("new-password")
    expect(signOut).toHaveBeenCalled()
    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /continue to sign in/i })).toHaveAttribute("href", "/login")
  })

  it("handles an unavailable recovery session gracefully", () => {
    render(
      <TestAuthProvider value={createAuthValue()}>
        <MemoryRouter><ResetPasswordPage /></MemoryRouter>
      </TestAuthProvider>,
    )

    expect(screen.getByRole("heading", { name: "Reset link unavailable" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /request a new reset link/i })).toHaveAttribute("href", "/forgot-password")
  })
})
