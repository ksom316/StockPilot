import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AppErrorBoundary } from "@/components/app-error-boundary"

function BrokenChild(): never { throw new Error("diagnostic-only failure") }

describe("AppErrorBoundary", () => {
  it("shows a safe recovery state instead of a blank screen", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    render(<AppErrorBoundary><BrokenChild /></AppErrorBoundary>)
    expect(screen.getByRole("heading", { name: /needs a refresh/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /go to dashboard/i })).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
