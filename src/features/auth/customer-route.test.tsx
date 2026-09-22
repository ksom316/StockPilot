import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { RequireModule } from "@/features/auth/route-guards"
import { TestBusinessProvider, createBusinessValue, testBusiness } from "@/test/auth-test-utils"

function renderRoute(enabled: boolean, role: "owner" | "manager" | "employee" | "cashier", path = "/customers") {
  return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules: enabled ? ["customers"] : [] })}><MemoryRouter initialEntries={[path]}><Routes><Route element={<RequireModule module="customers" />}><Route element={<p>Customer directory route</p>} path="/customers" /><Route element={<RequireModule allowedRoles={["owner", "manager"]} module="customers" />}><Route element={<p>Customer profile route</p>} path="/customers/:customerId" /></Route></Route><Route element={<p>Dashboard fallback</p>} path="/dashboard" /></Routes></MemoryRouter></TestBusinessProvider>)
}

describe("Customers module route", () => {
  it.each(["owner", "manager", "employee", "cashier"] as const)("allows %s to reach permitted directory", (role) => {
    renderRoute(true, role)
    expect(screen.getByText("Customer directory route")).toBeInTheDocument()
  })

  it("blocks the directory route while Customers is disabled", () => {
    renderRoute(false, "owner")
    expect(screen.getByText("Dashboard fallback")).toBeInTheDocument()
  })

  it.each(["owner", "manager"] as const)("allows %s to reach profile route", (role) => {
    renderRoute(true, role, "/customers/customer-1")
    expect(screen.getByText("Customer profile route")).toBeInTheDocument()
  })

  it.each(["employee", "cashier"] as const)("denies %s profile route", (role) => {
    renderRoute(true, role, "/customers/customer-1")
    expect(screen.queryByText("Customer profile route")).not.toBeInTheDocument()
    expect(screen.getByText("Dashboard fallback")).toBeInTheDocument()
  })

  it("blocks a customer profile while Customers is disabled", () => {
    renderRoute(false, "owner", "/customers/customer-1")
    expect(screen.getByText("Dashboard fallback")).toBeInTheDocument()
  })
})
