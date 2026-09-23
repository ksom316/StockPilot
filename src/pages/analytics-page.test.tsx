import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { AnalyticsPage } from "@/pages/analytics-page"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const mockState = vi.hoisted(() => ({
  overview: { isLoading: false, isError: false, data: { businessId: "business-1", startDate: "2026-09-01", endDate: "2026-09-30", timezone: "UTC", inventory: { activeProducts: 4, lowStockProducts: 1, outOfStockProducts: 1 }, sales: { enabled: true as const, recordedSales: "100.0000", saleCount: 2, averageRecordedSale: "50.0000", unitsSold: "5.000", topProductsByUnitsSold: [], dailyTrend: [] }, purchasing: { enabled: true, available: true, receiptCount: 1, purchaseReceipts: "40.0000", quantityReceived: "4.000" } }, refetch: vi.fn() },
  workspace: { isLoading: false, isError: false, data: { businessId: "business-1", startDate: "2026-09-01", endDate: "2026-09-30", timezone: "UTC", sales: { enabled: true, dailyTrend: [], topProductsByRevenue: [], topProductsByUnits: [] }, purchasing: { enabled: true, available: true, dailyTrend: [] }, finance: { enabled: true, dailyTrend: [] } }, refetch: vi.fn() },
  finance: { isLoading: false, isError: false, data: { estimatedNetProfit: "70.0000" }, refetch: vi.fn() },
}))

vi.mock("@/features/analytics/analytics-queries", () => ({ useBusinessOverview: () => mockState.overview }))
vi.mock("@/features/analytics/analytics-workspace-queries", () => ({ useAnalyticsWorkspace: () => mockState.workspace }))
vi.mock("@/features/finance/finance-queries", () => ({ useFinancialSummary: () => mockState.finance }))
vi.mock("@/pages/dashboard-visualizations", () => ({ InventoryStatus: () => <div>Inventory status visualization</div> }))

function renderPage(enabledModules: Array<"sales" | "purchasing" | "expenses" | "analytics"> = ["analytics", "sales", "purchasing", "expenses"]) {
  return render(<MemoryRouter><TestBusinessProvider value={createBusinessValue({ business: testBusiness, role: "owner", enabledModules })}><AnalyticsPage /></TestBusinessProvider></MemoryRouter>)
}

describe("AnalyticsPage", () => {
  it("shows the analytics workspace with module-aware sections and business-local period controls", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: "Business Analytics" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Sales performance" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Purchasing performance" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Estimated profitability" })).toBeInTheDocument()
    expect(screen.getByText("Inventory status visualization")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Analytics period" })).toHaveValue("month")
  })

  it("hides disabled module sections instead of showing zero-value financial analytics", () => {
    renderPage(["analytics"])
    expect(screen.queryByRole("heading", { name: "Sales performance" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Purchasing performance" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Estimated profitability" })).not.toBeInTheDocument()
  })

  it("rejects future custom dates", () => {
    renderPage(["analytics"])
    fireEvent.change(screen.getByRole("combobox", { name: "Analytics period" }), { target: { value: "custom" } })
    fireEvent.change(screen.getByLabelText("Analytics start date"), { target: { value: "2099-01-01" } })
    fireEvent.change(screen.getByLabelText("Analytics end date"), { target: { value: "2099-01-02" } })
    expect(screen.getByRole("status")).toHaveTextContent(/future dates/i)
  })
})
