import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { AppShell } from "@/components/layout/app-shell"
import { TestAuthProvider, TestBusinessProvider, createAuthValue, createBusinessValue, testBusiness, testSession } from "@/test/auth-test-utils"

function renderShell(role: "owner" | "manager" | "employee" | "cashier", enabledModules: Array<"smart_insights">) { return render(<TestAuthProvider value={createAuthValue({ session: testSession })}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules })}><MemoryRouter initialEntries={["/dashboard"]}><AppShell /></MemoryRouter></TestBusinessProvider></TestAuthProvider>) }

describe("Business Opportunities workspace navigation", () => {
  it.each(["owner", "manager"] as const)("shows Opportunities for enabled %s workspaces", (role) => { renderShell(role, ["smart_insights"]); expect(screen.getByRole("link", { name: "Opportunities" })).toHaveAttribute("href", "/opportunities") })
  it.each(["employee", "cashier"] as const)("hides Opportunities from %s workspaces", (role) => { renderShell(role, ["smart_insights"]); expect(screen.queryByRole("link", { name: "Opportunities" })).not.toBeInTheDocument() })
  it("hides Opportunities when Smart Insights is disabled", () => { renderShell("owner", []); expect(screen.queryByRole("link", { name: "Opportunities" })).not.toBeInTheDocument() })
})
