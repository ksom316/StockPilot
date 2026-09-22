import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { AppShell } from "@/components/layout/app-shell"
import { TestAuthProvider, TestBusinessProvider, createAuthValue, createBusinessValue, testBusiness, testSession } from "@/test/auth-test-utils"

function renderShell(enabled: boolean, role: "owner" | "manager" | "employee" | "cashier") {
  return render(<TestAuthProvider value={createAuthValue({ session: testSession })}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules: enabled ? ["customers"] : [] })}><MemoryRouter initialEntries={["/dashboard"]}><AppShell /></MemoryRouter></TestBusinessProvider></TestAuthProvider>)
}

describe("customer workspace navigation", () => {
  it.each(["owner", "manager", "employee", "cashier"] as const)("shows Customers for enabled %s workspaces", (role) => {
    renderShell(true, role)
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute("href", "/customers")
  })

  it("hides Customers navigation when the module is disabled", () => {
    renderShell(false, "owner")
    expect(screen.queryByRole("link", { name: "Customers" })).not.toBeInTheDocument()
  })
})
