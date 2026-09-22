import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const dashboardMocks = vi.hoisted(() => ({ useOverview: vi.fn(), useFinance: vi.fn() }))
vi.mock("@/features/analytics/analytics-queries", () => ({ useBusinessOverview: dashboardMocks.useOverview }))
vi.mock("@/features/finance/finance-queries", () => ({ useFinancialSummary: dashboardMocks.useFinance }))

import { DashboardPage } from "@/pages/dashboard-page"
import { createAuthValue, createBusinessValue, testBusiness, testMembership, testUser, TestAuthProvider, TestBusinessProvider } from "@/test/auth-test-utils"
import type { BusinessOverview } from "@/features/analytics/analytics-types"
import type { Membership } from "@/features/business/business-context"
import type { OptionalModule } from "@/features/business/modules"

const overview: BusinessOverview = {
  businessId: testBusiness.id,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  timezone: "America/New_York",
  inventory: { activeProducts: 5, lowStockProducts: 2, outOfStockProducts: 1 },
  sales: {
    enabled: true,
    recordedSales: "999999999999999.1234",
    saleCount: 2,
    averageRecordedSale: "499999999999999.5617",
    unitsSold: "3.125",
    topProductsByUnitsSold: [{ productId: "product-a", productName: "Historic Item", productSku: "OLD-1", unitsSold: "2.500", recordedSales: "500.0000" }],
    dailyTrend: [{ date: "2026-09-01", recordedSales: "999999999999999.1234", saleCount: 1 }, { date: "2026-09-02", recordedSales: "0.0000", saleCount: 0 }],
  },
  purchasing: { enabled: true, available: true, receiptCount: 1, purchaseReceipts: "12.3401", quantityReceived: "4.250" },
}

const financeSummary = { recordedSales: "10.0000", saleCount: 1, saleItemCount: 2, costedSaleItemCount: 1, missingCostSaleItemCount: 1, costCoverageComplete: false, estimatedProductCost: null, estimatedGrossProfit: null, estimatedGrossMargin: null, operatingExpenses: "4.5000", estimatedNetProfit: null, estimatedNetMargin: null, purchaseReceipts: null }

interface DashboardOptions {
  role?: Membership["role"]
  enabledModules?: OptionalModule[]
  data?: BusinessOverview
  financeData?: typeof financeSummary
  overviewLoading?: boolean
  overviewError?: boolean
  financeLoading?: boolean
  financeError?: boolean
}

function renderDashboard({ role = "owner", enabledModules = ["sales", "purchasing", "expenses"], data = overview, financeData = financeSummary, overviewLoading = false, overviewError = false, financeLoading = false, financeError = false }: DashboardOptions = {}) {
  dashboardMocks.useOverview.mockReturnValue({ data, isLoading: overviewLoading, isError: overviewError, refetch: vi.fn() })
  dashboardMocks.useFinance.mockReturnValue({ data: financeData, isLoading: financeLoading, isError: financeError, refetch: vi.fn() })
  return render(<MemoryRouter><TestAuthProvider value={createAuthValue({ user: testUser })}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, membership: testMembership, role, enabledModules, onboardingRequired: false })}><DashboardPage /></TestBusinessProvider></TestAuthProvider></MemoryRouter>)
}

describe("module-aware dashboard overview", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("shows a useful Inventory-only dashboard without fetching a product catalog", () => {
    renderDashboard({ enabledModules: [] })
    const inventory = screen.getByRole("region", { name: /inventory overview/i })
    expect(within(inventory).getByRole("link", { name: "Active Products: 5" })).toHaveAttribute("href", "/inventory")
    expect(within(inventory).getByRole("link", { name: "Low Stock: 2" })).toHaveAttribute("href", "/inventory?stock=low")
    expect(within(inventory).getByRole("link", { name: "Out of Stock: 1" })).toHaveAttribute("href", "/inventory?stock=out")
    expect(within(inventory).getByRole("heading", { name: "Inventory Status" })).toBeInTheDocument()
    expect(within(inventory).getByRole("list", { name: "Inventory status counts" })).toHaveTextContent("In Stock2Low Stock2Out of Stock1")
    expect(screen.queryByRole("region", { name: /sales overview/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: /purchasing overview/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: /financial overview/i })).not.toBeInTheDocument()
  })

  it("shows consistent period Sales metrics, exact decimal formatting, and snapshot top products", () => {
    renderDashboard({ enabledModules: ["sales"] })
    const sales = screen.getByRole("region", { name: /sales overview/i })
    expect(within(sales).getByText("Recorded Sales").parentElement).toHaveTextContent("$999,999,999,999,999.1234")
    expect(within(sales).getByText("Sale Count").parentElement).toHaveTextContent("2")
    expect(within(sales).getByText("Average Recorded Sale").parentElement).toHaveTextContent("$499,999,999,999,999.5617")
    expect(within(sales).getByText("Units Sold During Period").parentElement).toHaveTextContent("3.125")
    expect(within(sales).getByRole("heading", { name: "Top Products by Units Sold" })).toBeInTheDocument()
    expect(within(sales).getByText("Historic Item")).toBeInTheDocument()
    expect(within(sales).getByRole("heading", { name: "Recorded Sales Trend" })).toBeInTheDocument()
    expect(within(sales).getByRole("img", { name: "Line chart of daily Recorded Sales" })).toBeInTheDocument()
    expect(within(sales).getByText((_, element) => element?.tagName === "LI" && element.textContent?.includes("999,999,999,999,999.1234 Recorded Sales") === true)).toBeInTheDocument()
    expect(within(sales).getAllByText((_, element) => element?.tagName === "LI" && element.textContent?.includes("Sept") === true)).toHaveLength(2)
    expect(within(sales).getByText("SKU OLD-1")).toBeInTheDocument()
    expect(screen.queryByText(/fast moving/i)).not.toBeInTheDocument()
  })

  it("hides disabled Sales and shows an enabled zero-activity state", () => {
    const disabled = { ...overview, sales: { enabled: false as const } }
    const { unmount } = renderDashboard({ data: disabled, enabledModules: [] })
    expect(screen.queryByRole("region", { name: /sales overview/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Recorded Sales Trend" })).not.toBeInTheDocument()
    unmount()
    const empty = { ...overview, sales: { ...overview.sales, recordedSales: "0.0000", saleCount: 0, averageRecordedSale: null, unitsSold: "0.000", topProductsByUnitsSold: [], dailyTrend: [] } }
    renderDashboard({ data: empty, enabledModules: ["sales"] })
    const sales = screen.getByRole("region", { name: /sales overview/i })
    expect(within(sales).getByText("No Sales were recorded in this period.")).toBeInTheDocument()
    expect(within(sales).getByText("No recorded sales in this period.")).toBeInTheDocument()
    expect(within(sales).getByText("Average Recorded Sale").parentElement).toHaveTextContent("—")
    expect(within(sales).queryByRole("heading", { name: "Top Products by Units Sold" })).not.toBeInTheDocument()
  })

  it("shows Purchasing only for authorized roles and never renders cashier metrics", () => {
    const { unmount } = renderDashboard({ role: "employee", enabledModules: ["purchasing"] })
    const purchasing = screen.getByRole("region", { name: /purchasing overview/i })
    expect(within(purchasing).getByText("Purchase Receipt Total").parentElement).toHaveTextContent("$12.3401")
    unmount()
    renderDashboard({ role: "cashier", enabledModules: ["purchasing"] })
    expect(screen.queryByRole("region", { name: /purchasing overview/i })).not.toBeInTheDocument()
    expect(screen.queryByText("$12.3401")).not.toBeInTheDocument()
  })

  it.each(["owner", "manager"] as const)("shows canonical Finance metrics to %s only", (role) => {
    renderDashboard({ role, enabledModules: ["expenses"] })
    const finance = screen.getByRole("region", { name: /estimated financial overview/i })
    expect(within(finance).getByText("Operating Expenses").parentElement).toHaveTextContent("$4.50")
    expect(within(finance).getByText("Estimated Gross Profit").parentElement).toHaveTextContent("Unavailable")
    expect(within(finance).getByText("Cost Coverage").parentElement).toHaveTextContent("1 / 2")
    expect(dashboardMocks.useFinance).toHaveBeenCalledWith(expect.anything(), true)
  })

  it.each(["employee", "cashier"] as const)("does not expose Finance to %s", (role) => {
    renderDashboard({ role, enabledModules: ["expenses"] })
    expect(screen.queryByRole("region", { name: /estimated financial overview/i })).not.toBeInTheDocument()
    expect(dashboardMocks.useFinance).toHaveBeenCalledWith(expect.anything(), false)
  })

  it("keeps the operational overview visible when Finance fails", () => {
    renderDashboard({ financeError: true })
    expect(screen.getByRole("region", { name: /inventory overview/i })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: /sales overview/i })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Finance summary unavailable")
  })

  it("shows factual attention and neutral healthy/empty states", () => {
    const first = renderDashboard()
    const inventory = screen.getByRole("region", { name: /inventory overview/i })
    expect(within(inventory).getByText("1 active product is out of stock.")).toBeInTheDocument()
    expect(within(inventory).getByText("2 active products are low on stock.")).toBeInTheDocument()
    first.unmount()
    const healthy = { ...overview, inventory: { activeProducts: 1, lowStockProducts: 0, outOfStockProducts: 0 } }
    const { unmount } = renderDashboard({ data: healthy, enabledModules: [] })
    expect(screen.getByRole("status")).toHaveTextContent("Stock is healthy")
    unmount()
    const empty = { ...overview, inventory: { activeProducts: 0, lowStockProducts: 0, outOfStockProducts: 0 } }
    renderDashboard({ data: empty, enabledModules: [] })
    expect(screen.getByText("No active products yet")).toBeInTheDocument()
    expect(screen.getByText("No active products to show.")).toBeInTheDocument()
  })

  it("validates the shared custom date range at 366 days", () => {
    renderDashboard({ enabledModules: [] })
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "custom" } })
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2025-01-01" } })
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-01-02" } })
    expect(screen.getByText(/at most 366 calendar days/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-01-01" } })
    expect(screen.queryByText(/at most 366 calendar days/i)).not.toBeInTheDocument()
  })

  it("passes changed dashboard dates to the existing overview query", () => {
    renderDashboard({ enabledModules: ["sales"] })
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "custom" } })
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-09-03" } })
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-09-08" } })
    const latestRange = dashboardMocks.useOverview.mock.lastCall?.[0]
    expect(latestRange).toMatchObject({ startDate: "2026-09-03", endDate: "2026-09-08" })
  })

  it("does not show finance or change operational charts for a cashier", () => {
    renderDashboard({ role: "cashier", enabledModules: ["sales"] })
    expect(screen.getByRole("heading", { name: "Recorded Sales Trend" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Inventory Status" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: /estimated financial overview/i })).not.toBeInTheDocument()
    expect(dashboardMocks.useFinance).toHaveBeenCalledWith(expect.anything(), false)
  })
})
