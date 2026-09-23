import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { ForgotPasswordPage, genericSuccessMessage } from "@/pages/forgot-password-page"
import { createAuthValue, TestAuthProvider } from "@/test/auth-test-utils"

function renderPage(requestPasswordReset = vi.fn()) {
  return render(
    <TestAuthProvider value={createAuthValue({ requestPasswordReset })}>
      <MemoryRouter><ForgotPasswordPage /></MemoryRouter>
    </TestAuthProvider>,
  )
}

describe("ForgotPasswordPage", () => {
  it("validates the email before requesting recovery", async () => {
    const user = userEvent.setup()
    const requestPasswordReset = vi.fn()
    renderPage(requestPasswordReset)

    await user.click(screen.getByRole("button", { name: /send reset instructions/i }))

    expect(screen.getByText("Enter your email address.")).toBeInTheDocument()
    expect(requestPasswordReset).not.toHaveBeenCalled()
  })

  it("requests recovery and always shows the generic success response", async () => {
    const user = userEvent.setup()
    const requestPasswordReset = vi.fn().mockResolvedValue(undefined)
    renderPage(requestPasswordReset)

    await user.type(screen.getByLabelText("Email"), "owner@example.com")
    await user.click(screen.getByRole("button", { name: /send reset instructions/i }))

    expect(requestPasswordReset).toHaveBeenCalledWith("owner@example.com")
    expect(await screen.findByText(genericSuccessMessage)).toBeInTheDocument()
  })
})
