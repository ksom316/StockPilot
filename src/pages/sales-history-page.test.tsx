import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import type { SaleDetail, SaleSummary } from "@/features/sales/sales-types"
import { SaleDetailPage } from "@/pages/sale-detail-page"
import { SalesHistoryPage } from "@/pages/sales-history-page"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const salesMocks = vi.hoisted(() => ({ history: { data: [] as SaleSummary[], isLoading: false, isError: false, refetch: vi.fn() }, detail: { data: null as SaleDetail | null, isLoading: false, isError: false, refetch: vi.fn() } }))
vi.mock("@/features/sales/sales-queries", () => ({
  useSalesHistory: () => salesMocks.history,
  useSaleDetail: () => salesMocks.detail,
}))

const history: SaleSummary[] = [
  { id: "sale-1", businessId: "business-1", saleReference: "SALE-000001", customerNameSnapshot: "Avery Example", soldAt: "2026-09-20T12:00:00Z", subtotal: "106.5122", total: "106.5122", notes: "Counter order", createdBy: "user-1", recordedByName: "Kwaku", recordedByRole: "owner", itemCount: 1, items: [{ productName: "Phone Case", productSku: "CASE-01" }] },
  { id: "sale-2", businessId: "business-1", saleReference: "SALE-000002", customerNameSnapshot: null, soldAt: "2026-09-21T12:00:00Z", subtotal: "25", total: "25", notes: null, createdBy: "user-2", recordedByName: null, recordedByRole: null, itemCount: 1, items: [{ productName: "Tea", productSku: "TEA-2" }] },
]

const detail: SaleDetail = { ...history[0], items: [{ id: "line-1", productId: "product-1", productName: "Phone Case", productSku: "CASE-01", quantity: "2.125", unitPrice: "50.1234", lineTotal: "106.5122" }] }

function renderSales(path = "/sales/history") {
  return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, enabledModules: ["sales"] })}><MemoryRouter initialEntries={[path]}><Routes><Route element={<SalesHistoryPage />} path="/sales/history" /><Route element={<SaleDetailPage />} path="/sales/:saleId" /><Route element={<p>Sale destination</p>} path="/destination" /></Routes></MemoryRouter></TestBusinessProvider>)
}

describe("sales history and details", () => {
  beforeEach(() => {
    salesMocks.history = { data: history, isLoading: false, isError: false, refetch: vi.fn() }
    salesMocks.detail = { data: detail, isLoading: false, isError: false, refetch: vi.fn() }
  })

  it("shows a dedicated empty state when there are no sales", () => {
    salesMocks.history.data = []
    renderSales()
    expect(screen.getByRole("heading", { name: /no sales yet/i })).toBeInTheDocument()
  })

  it("renders references, dates, totals, and safely neutral actor labels", () => {
    renderSales()
    expect(screen.getAllByText("SALE-000001").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/106\.51/).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Kwaku · Owner").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Customer: Avery Example/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Customer: Anonymous/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/555-0100|avery@example/i)).not.toBeInTheDocument()
  })

  it("filters transaction history by immutable customer name snapshot", async () => {
    const user = userEvent.setup()
    renderSales()
    await user.type(screen.getByRole("searchbox", { name: /search sales/i }), "Avery Example")
    expect(screen.getAllByText("SALE-000001").length).toBeGreaterThan(0)
    expect(screen.queryByText("SALE-000002")).not.toBeInTheDocument()
  })

  it("filters by reference and snapshotted SKU, supports date range, and shows filtered-empty state", async () => {
    const user = userEvent.setup()
    renderSales()
    const search = screen.getByRole("searchbox", { name: /search sales/i })
    await user.type(search, "SALE-000002")
    expect(screen.getAllByText("SALE-000002").length).toBeGreaterThan(0)
    expect(screen.queryByText("SALE-000001")).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, "CASE-01")
    expect(screen.getAllByText("SALE-000001").length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-21" } })
    expect(screen.getByRole("heading", { name: /no matching sales/i })).toBeInTheDocument()
  })

  it("clears malformed URL date filters safely", () => {
    renderSales("/sales/history?from=not-a-date&to=2026-09-22")
    expect(screen.getByLabelText("From date")).toHaveValue("")
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument()
    expect(screen.getAllByText("SALE-000001").length).toBeGreaterThan(0)
  })

  it("provides a reset action for a reversed URL date range", () => {
    renderSales("/sales/history?from=2026-09-22&to=2026-09-20")
    expect(screen.getByRole("status")).toHaveTextContent(/date range was invalid/i)
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument()
  })

  it("links a history row to the matching sale detail route", async () => {
    const user = userEvent.setup()
    renderSales()
    const view = screen.getAllByRole("link", { name: "View sale SALE-000001" })[0]
    expect(view).toHaveAttribute("href", "/sales/sale-1")
    await user.click(view)
    expect(await screen.findByRole("heading", { name: "SALE-000001" })).toBeInTheDocument()
  })

  it("renders historical product, SKU, transaction price, and exact large totals from snapshots", () => {
    salesMocks.detail.data = { ...detail, total: "999999999999999.1234", items: [{ ...detail.items[0], productName: "Phone Case", productSku: "CASE-01", unitPrice: "50.1234" }] }
    renderSales("/sales/sale-1")
    expect(screen.getByText("Phone Case")).toBeInTheDocument()
    expect(screen.getByText("SKU CASE-01")).toBeInTheDocument()
    expect(screen.getByText(/50\.1234/)).toBeInTheDocument()
    expect(screen.getAllByText(/999,999,999,999,999\.1234/).length).toBeGreaterThan(0)
  })

  it("shows a neutral unavailable state for an inaccessible sale", () => {
    salesMocks.detail.data = null
    renderSales("/sales/other-tenant-id")
    expect(screen.getByRole("heading", { name: /sale unavailable/i })).toBeInTheDocument()
    expect(screen.getByText(/unavailable or could not be found/i)).toBeInTheDocument()
    expect(screen.queryByText(/other-tenant-id/)).not.toBeInTheDocument()
  })
})
