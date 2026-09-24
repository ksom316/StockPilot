import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { AccountMenu } from "@/components/layout/account-menu"

describe("AccountMenu profile photo discoverability", () => {
  const baseProps = {
    label: "owner@example.com",
    avatarId: "user" as const,
    avatarLabel: "Alex Morgan",
    avatarPath: null,
    isSigningOut: false,
    isUpdatingAvatar: false,
    profileError: "",
    onAvatarChange: vi.fn(),
    onAvatarUpload: vi.fn().mockResolvedValue(undefined),
    onAvatarRemove: vi.fn().mockResolvedValue(undefined),
    onSignOut: vi.fn(),
  }

  it("shows upload photo when the account has no photo", async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AccountMenu {...baseProps} /></MemoryRouter>)
    await user.click(screen.getByRole("button", { name: /owner@example.com/i }))
    expect(screen.getByText("Profile photo")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument()
  })

  it("shows change and remove for an existing photo", async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><AccountMenu {...baseProps} avatarPath="profiles/user-1/photo.png" /></MemoryRouter>)
    await user.click(screen.getByRole("button", { name: /owner@example.com/i }))
    expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument()
  })
})
