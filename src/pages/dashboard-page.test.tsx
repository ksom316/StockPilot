import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const dashboardMocks = vi.hoisted(() => ({ useProducts: vi.fn() }))

vi.mock("@/features/inventory/inventory-queries", () => ({ useInventoryProducts: dashboardMocks.useProducts }))

import { DashboardPage } from "@/pages/dashboard-page"
import { createAuthValue, createBusinessValue, testBusiness, testMembership, testUser, TestAuthProvider, TestBusinessProvider } from "@/test/auth-test-utils"

const products = [
  { id: "p1", businessId: testBusiness.id, categoryId: null, categoryName: null, name: "Low item", sku: "LOW", description: null, costPrice: "1", sellingPrice: "2", currentQuantity: "2.5", lowStockThreshold: "3", isActive: true },
  { id: "p2", businessId: testBusiness.id, categoryId: null, categoryName: null, name: "Empty item", sku: "EMPTY", description: null, costPrice: "1", sellingPrice: "2", currentQuantity: "0", lowStockThreshold: "3", isActive: true },
  { id: "p3", businessId: testBusiness.id, categoryId: null, categoryName: null, name: "Healthy item", sku: "OK", description: null, costPrice: "1", sellingPrice: "2", currentQuantity: "10", lowStockThreshold: "3", isActive: true },
  { id: "p4", businessId: testBusiness.id, categoryId: null, categoryName: null, name: "Inactive item", sku: "INACTIVE", description: null, costPrice: "1", sellingPrice: "2", currentQuantity: "0", lowStockThreshold: "3", isActive: false },
]

function renderDashboard() {
  return render(
    <MemoryRouter><TestAuthProvider value={createAuthValue({ user: testUser })}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, membership: testMembership, role: "owner", enabledModules: ["sales"], onboardingRequired: false })}><DashboardPage /></TestBusinessProvider></TestAuthProvider></MemoryRouter>,
  )
}

describe("DashboardPage inventory integration", () => {
  beforeEach(() => dashboardMocks.useProducts.mockReturnValue({ data: products, isLoading: false, isError: false, refetch: vi.fn() }))

  it("derives active, low-stock, and out-of-stock counts from product data", () => {
    renderDashboard()
    const summary = screen.getByRole("region", { name: /inventory overview/i })
    expect(within(summary).getByText("Active products").parentElement).toHaveTextContent("3")
    expect(within(summary).getByText("Low stock").parentElement).toHaveTextContent("1")
    expect(within(summary).getByText("Out of stock").parentElement).toHaveTextContent("1")
    expect(within(summary).getByText(/2 active products need stock attention/i)).toBeInTheDocument()
  })

  it("links inventory, history, and attention navigation to their filtered routes", () => {
    renderDashboard()
    const summary = screen.getByRole("region", { name: /inventory overview/i })
    expect(within(summary).getByRole("link", { name: /view inventory/i })).toHaveAttribute("href", "/inventory")
    expect(within(summary).getByRole("link", { name: /view stock history/i })).toHaveAttribute("href", "/inventory/movements")
    expect(within(summary).getByRole("link", { name: /view attention items/i })).toHaveAttribute("href", "/inventory?stock=attention")
    expect(screen.getByText("Sales")).toBeInTheDocument()
  })

  it("shows a helpful empty state and a safe error message", () => {
    dashboardMocks.useProducts.mockReturnValueOnce({ data: [], isLoading: false, isError: false, refetch: vi.fn() })
    const { unmount } = renderDashboard()
    expect(screen.getByText(/no active products yet/i)).toBeInTheDocument()
    unmount()
    dashboardMocks.useProducts.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true, error: new Error("raw postgres detail"), refetch: vi.fn() })
    renderDashboard()
    expect(screen.getByRole("alert")).toHaveTextContent(/inventory summary unavailable/i)
    expect(screen.getByRole("alert")).not.toHaveTextContent(/raw postgres detail/i)
  })
})
