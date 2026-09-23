import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { AppShell } from "@/components/layout/app-shell"
import { TestAuthProvider, TestBusinessProvider, createAuthValue, createBusinessValue, testBusiness, testSession } from "@/test/auth-test-utils"

function renderShell(role: "owner" | "manager" | "employee" | "cashier", enabledModules: Array<"team">) { return render(<TestAuthProvider value={createAuthValue({ session: testSession })}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules })}><MemoryRouter initialEntries={["/dashboard"]}><AppShell /></MemoryRouter></TestBusinessProvider></TestAuthProvider>) }
describe("Team workspace navigation", () => {
  it.each(["owner", "manager"] as const)("shows Team for enabled %s", (role) => { renderShell(role, ["team"]); expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute("href", "/team") })
  it.each(["employee", "cashier"] as const)("hides Team for %s", (role) => { renderShell(role, ["team"]); expect(screen.queryByRole("link", { name: "Team" })).not.toBeInTheDocument() })
  it("hides Team when the module is disabled", () => { renderShell("owner", []); expect(screen.queryByRole("link", { name: "Team" })).not.toBeInTheDocument() })
})
