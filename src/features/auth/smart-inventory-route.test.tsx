import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { RequireModule } from "@/features/auth/route-guards"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

function renderRoute(enabled: boolean, role: "owner" | "manager" | "employee" | "cashier") {
  return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules: enabled ? ["smart_insights"] : [] })}><MemoryRouter initialEntries={["/inventory/insights"]}><Routes><Route element={<RequireModule allowedRoles={["owner", "manager", "employee"]} module="smart_insights" />}><Route element={<p>Smart Inventory workspace</p>} path="/inventory/insights" /></Route><Route element={<p>Dashboard fallback</p>} path="/dashboard" /></Routes></MemoryRouter></TestBusinessProvider>)
}

describe("Smart Inventory route guard", () => {
  it.each(["owner", "manager", "employee"] as const)("allows %s when Smart Inventory is enabled", (role) => {
    renderRoute(true, role)
    expect(screen.getByText("Smart Inventory workspace")).toBeInTheDocument()
  })

  it("blocks cashier access", () => {
    renderRoute(true, "cashier")
    expect(screen.getByText("Dashboard fallback")).toBeInTheDocument()
  })

  it("blocks the route when the module is disabled", () => {
    renderRoute(false, "owner")
    expect(screen.getByText("Dashboard fallback")).toBeInTheDocument()
  })
})

