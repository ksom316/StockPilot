import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { AppShell } from "@/components/layout/app-shell"
import { TestAuthProvider, TestBusinessProvider, createAuthValue, createBusinessValue, testBusiness, testSession } from "@/test/auth-test-utils"

function renderShell(role: "owner" | "manager" | "employee" | "cashier", enabled: boolean) {
  return render(<TestAuthProvider value={createAuthValue({ session: testSession })}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules: enabled ? ["ai_analyst"] : [] })}><MemoryRouter initialEntries={["/dashboard"]}><AppShell /></MemoryRouter></TestBusinessProvider></TestAuthProvider>)
}

describe("AI Analyst workspace navigation", () => {
  it.each(["owner", "manager"] as const)("shows AI Analyst for enabled %s workspaces", (role) => {
    renderShell(role, true)
    expect(screen.getByRole("link", { name: "AI Analyst" })).toHaveAttribute("href", "/analyst")
  })

  it.each(["employee", "cashier"] as const)("hides AI Analyst from %s workspaces", (role) => {
    renderShell(role, true)
    expect(screen.queryByRole("link", { name: "AI Analyst" })).not.toBeInTheDocument()
  })

  it("hides AI Analyst when the module is disabled", () => {
    renderShell("owner", false)
    expect(screen.queryByRole("link", { name: "AI Analyst" })).not.toBeInTheDocument()
  })
})
