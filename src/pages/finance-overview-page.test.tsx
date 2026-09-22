import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FinanceOverviewPage } from "@/pages/finance-overview-page"
import { useFinancialSummary } from "@/features/finance/finance-queries"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

vi.mock("@/features/finance/finance-queries", () => ({ useFinancialSummary: vi.fn() }))

const completeSummary = {
  recordedSales: "9007199254740993.1234", saleCount: 1, saleItemCount: 2, costedSaleItemCount: 2,
  missingCostSaleItemCount: 0, costCoverageComplete: true, estimatedProductCost: "0.0000",
  estimatedGrossProfit: "9007199254740993.1234", estimatedGrossMargin: "100.0000",
  operatingExpenses: "12.3400", estimatedNetProfit: "9007199254740980.7834",
  estimatedNetMargin: "99.9999", purchaseReceipts: "75.0000",
}

describe("FinanceOverviewPage", () => {
  const query = vi.mocked(useFinancialSummary)
  beforeEach(() => query.mockReset())
  function renderPage() {
    return render(<MemoryRouter><TestBusinessProvider value={createBusinessValue({ business: testBusiness, role: "owner", enabledModules: ["expenses"] })}><FinanceOverviewPage /></TestBusinessProvider></MemoryRouter>)
  }

  it("displays exact RPC values, known zero cost, separate receipts, and section navigation", () => {
    query.mockReturnValue({ data: completeSummary, isLoading: false, isError: false, refetch: vi.fn() } as never)
    renderPage()
    expect(screen.getAllByText("US$9,007,199,254,740,993.1234").length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText("Estimated Product Cost")[0].parentElement).toHaveTextContent("US$0.00")
    expect(screen.getAllByText("Estimated Gross Profit")[0].parentElement).toHaveTextContent("US$9,007,199,254,740,993.1234")
    expect(screen.getAllByText("Operating Expenses")[0].parentElement).toHaveTextContent("US$12.34")
    expect(screen.getAllByText("Estimated Net Profit")[0].parentElement).toHaveTextContent("US$9,007,199,254,740,980.7834")
    expect(screen.getByText("Estimated Gross Margin").parentElement).toHaveTextContent("100.0000%")
    expect(screen.getByText("Purchase Receipts").parentElement).toHaveTextContent("US$75.00")
    expect(screen.getByRole("link", { name: "Manage Expenses" })).toHaveAttribute("href", "/finance/expenses")
    expect(screen.getByRole("navigation", { name: "Finance navigation" })).toBeInTheDocument()
    expect(query).toHaveBeenCalledWith({ startDate: "2026-09-01", endDate: "2026-09-30" })
  })

  it("marks incomplete costs unavailable rather than displaying null estimates as zero", () => {
    query.mockReturnValue({ data: { ...completeSummary, costCoverageComplete: false, costedSaleItemCount: 1, missingCostSaleItemCount: 1, estimatedProductCost: null, estimatedGrossProfit: null, estimatedGrossMargin: null, estimatedNetProfit: null, estimatedNetMargin: null }, isLoading: false, isError: false, refetch: vi.fn() } as never)
    renderPage()
    expect(screen.getByRole("heading", { name: /estimated profitability is incomplete/i })).toBeInTheDocument()
    expect(screen.getByText(/some sales in this period do not have a recorded estimated cost basis/i)).toBeInTheDocument()
    expect(screen.getByText("Cost basis recorded for 1 of 2 sale items · 1 missing")).toBeInTheDocument()
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(5)
    expect(screen.queryByText("$0.0000")).not.toBeInTheDocument()
  })

  it("explains no-sales periods while keeping expenses and receipts separate", () => {
    query.mockReturnValue({ data: { ...completeSummary, recordedSales: "0.0000", saleCount: 0, saleItemCount: 0, costedSaleItemCount: 0, estimatedProductCost: "0.0000", estimatedGrossProfit: "0.0000", estimatedGrossMargin: null, operatingExpenses: "12.3400", estimatedNetProfit: "-12.3400", estimatedNetMargin: null, purchaseReceipts: null }, isLoading: false, isError: false, refetch: vi.fn() } as never)
    renderPage()
    expect(screen.getByText(/no sales were recorded in this period/i)).toBeInTheDocument()
    expect(screen.getAllByText("Estimated Net Profit")[0].parentElement).toHaveTextContent("-US$12.34")
    expect(screen.queryByText("Purchase Receipts")).not.toBeInTheDocument()
    expect(screen.getAllByText("Estimated Net Margin")[0].parentElement).toHaveTextContent("Unavailable")
  })

  it("changes the queried range when a period is selected and handles custom ranges", async () => {
    const user = userEvent.setup()
    query.mockReturnValue({ data: completeSummary, isLoading: false, isError: false, refetch: vi.fn() } as never)
    renderPage()
    await user.selectOptions(screen.getByRole("combobox", { name: "Period" }), "week")
    expect(query).toHaveBeenLastCalledWith({ startDate: "2026-09-21", endDate: "2026-09-27" })
    await user.selectOptions(screen.getByRole("combobox", { name: "Period" }), "custom")
    await user.type(screen.getByLabelText("Start date"), "2026-09-03")
    await user.type(screen.getByLabelText("End date"), "2026-09-12")
    expect(query).toHaveBeenLastCalledWith({ startDate: "2026-09-03", endDate: "2026-09-12" })
  })

  it("shows loading and retryable RPC error states", () => {
    query.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as never)
    const { rerender } = renderPage()
    expect(screen.getByRole("status")).toHaveTextContent(/loading financial summary/i)
    query.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as never)
    rerender(<MemoryRouter><TestBusinessProvider value={createBusinessValue({ business: testBusiness, role: "owner", enabledModules: ["expenses"] })}><FinanceOverviewPage /></TestBusinessProvider></MemoryRouter>)
    expect(screen.getByRole("alert")).toHaveTextContent(/financial summary unavailable/i)
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument()
  })
})
