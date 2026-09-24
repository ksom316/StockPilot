import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ProfileAvatar } from "@/components/branding/profile-avatar"

describe("ProfileAvatar", () => {
  it("uses initials when no profile photo exists", () => {
    render(<ProfileAvatar label="Alex Morgan" path={null} />)
    expect(screen.getByRole("img", { name: "Alex Morgan" })).toHaveTextContent("AM")
  })
})
