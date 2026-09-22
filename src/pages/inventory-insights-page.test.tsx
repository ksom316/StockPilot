import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createBusinessValue, testBusiness, testMembership, TestBusinessProvider } from "@/test/auth-test-utils"

const queryMocks = vi.hoisted(() => ({ useSnapshot: vi.fn() }))
vi.mock("@/features/smart-inventory/smart-inventory-queries", () => ({
  SMART_INVENTORY_PAGE_SIZE: 2,
  useSmartInventorySnapshot: queryMocks.useSnapshot,
}))

import { InventoryInsightsPage } from "@/pages/inventory-insights-page"

const product = (overrides: Record<string, unknown> = {}) => ({
  productId: "product-1",
  productName: "Coffee Beans",
  productSku: "COF-1",
  stock: { currentQuantity: "4.500", lowStockThreshold: "5.000", state: "LOW_STOCK", reorderAttention: true },
  salesObservation: { enabled: true, eligibleDays: 30, completeWindow: true, contextCode: "RECORDED_SALES_OBSERVED", recordedSalesQuantity: "12.000", distinctSaleDates: 6, averageRecordedQuantityPerDay: "0.40000000000000000000" },
  daysOfStock: { status: "ESTIMATE_AVAILABLE", unavailableReason: null, estimatedDays: "9.8765" },
  inventoryMovementObservation: { eligibleDays: 30, completeWindow: true, contextCode: "RECORDED_INVENTORY_MOVEMENTS_OBSERVED", movementCount: 2, netMovementQuantity: "-0.500" },
  ...overrides,
})

const snapshot = (products = [product()]) => ({
  businessId: testBusiness.id,
  timezone: "UTC",
  asOfDate: "2026-09-22",
  window: { startDate: "2026-08-23", endDateExclusive: "2026-09-22", completedBusinessDates: 30 },
  modules: { smartInsightsEnabled: true, salesEnabled: true },
  pagination: { page: 1, pageSize: 2, totalItems: products.length, totalPages: 1 },
  products,
})

function renderPage(overrides: Partial<Parameters<typeof createBusinessValue>[0]> = {}) {
  return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, membership: testMembership, role: "owner", enabledModules: ["smart_insights"], onboardingRequired: false, ...overrides })}><MemoryRouter><InventoryInsightsPage /></MemoryRouter></TestBusinessProvider>)
}

describe("Smart Inventory experience", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMocks.useSnapshot.mockReturnValue({ data: snapshot(), isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })
  })

  it("shows factual stock, Recorded Sales, estimate, and explanation text", () => {
    renderPage()
    expect(screen.getByRole("heading", { name: "Smart Inventory" })).toBeInTheDocument()
    expect(screen.getAllByText("Low Stock").length).toBeGreaterThan(0)
    expect(screen.getByText("12 units recorded in Sales across 6 Sales dates during the last 30 completed days.")).toBeInTheDocument()
    expect(screen.getByText("9.9 days")).toBeInTheDocument()
    expect(screen.getByText(/at or below the stock threshold of 5\./i)).toBeInTheDocument()
  })

  it("renders all factual stock states and backend contexts without inventing classifications", () => {
    const products = [
      product(),
      product({ productId: "product-2", productName: "Out Product", stock: { currentQuantity: "0.000", lowStockThreshold: "0.000", state: "OUT_OF_STOCK", reorderAttention: true }, salesObservation: { enabled: true, eligibleDays: 30, completeWindow: true, contextCode: "NO_RECORDED_SALES_30D", recordedSalesQuantity: "0.000", distinctSaleDates: 0, averageRecordedQuantityPerDay: null }, daysOfStock: { status: "DAYS_ESTIMATE_UNAVAILABLE", unavailableReason: "OUT_OF_STOCK", estimatedDays: null } }),
      product({ productId: "product-3", productName: "New Product", stock: { currentQuantity: "8.250", lowStockThreshold: "2.000", state: "IN_STOCK", reorderAttention: false }, salesObservation: { enabled: true, eligibleDays: 4, completeWindow: false, contextCode: "INSUFFICIENT_HISTORY", recordedSalesQuantity: "1.250", distinctSaleDates: 1, averageRecordedQuantityPerDay: null }, daysOfStock: { status: "DAYS_ESTIMATE_UNAVAILABLE", unavailableReason: "INSUFFICIENT_HISTORY", estimatedDays: null } }),
    ]
    queryMocks.useSnapshot.mockReturnValue({ data: snapshot(products), isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })
    renderPage()
    expect(screen.getAllByText("Out of Stock").length).toBeGreaterThan(0)
    expect(screen.getAllByText("In Stock").length).toBeGreaterThan(0)
    expect(screen.getByText(/No Recorded Sales during the last 30 completed days/i)).toBeInTheDocument()
    expect(screen.getByText(/Not enough complete history yet for a 30-day Sales estimate/i)).toBeInTheDocument()
    expect(screen.queryByText(/Slow|Poor Seller|Low Demand/i)).not.toBeInTheDocument()
  })

  it("keeps Sales-disabled businesses useful without Sales claims", () => {
    const salesDisabled = product({
      salesObservation: { enabled: false, eligibleDays: 0, completeWindow: false, contextCode: "SALES_DISABLED", recordedSalesQuantity: null, distinctSaleDates: null, averageRecordedQuantityPerDay: null },
      daysOfStock: { status: "DAYS_ESTIMATE_UNAVAILABLE", unavailableReason: "SALES_DISABLED", estimatedDays: null },
      inventoryMovementObservation: { eligibleDays: 30, completeWindow: true, contextCode: "NO_RECORDED_INVENTORY_MOVEMENTS_30D", movementCount: 0, netMovementQuantity: "0.000" },
    })
    queryMocks.useSnapshot.mockReturnValue({ data: { ...snapshot([salesDisabled]), modules: { smartInsightsEnabled: true, salesEnabled: false } }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })
    renderPage()
    expect(screen.getByText("Sales-based insights require recorded Sales history.")).toBeInTheDocument()
    expect(screen.getByText("Sales-based estimates are unavailable because Sales is disabled.")).toBeInTheDocument()
    expect(screen.queryByText(/No Recorded Sales during/i)).not.toBeInTheDocument()
    expect(screen.getByText(/No recorded inventory movements during/i)).toBeInTheDocument()
  })

  it("displays 365+ without changing the canonical estimate value", () => {
    queryMocks.useSnapshot.mockReturnValue({ data: snapshot([product({ daysOfStock: { status: "ESTIMATE_AVAILABLE", unavailableReason: null, estimatedDays: "999999999999999.999" } })]), isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })
    renderPage()
    expect(screen.getAllByText("365+ days").length).toBeGreaterThan(0)
  })

  it("makes search and filters explicitly page-scoped", async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByText(/Search and filters apply to this page only/i)).toBeInTheDocument()
    await user.type(screen.getByRole("searchbox", { name: "Search this page" }), "missing")
    expect(screen.getByText("No matching products on this page.")).toBeInTheDocument()
    await user.clear(screen.getByRole("searchbox", { name: "Search this page" }))
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter this page" }), "out")
    expect(screen.getByText("No matching products on this page.")).toBeInTheDocument()
  })

  it("uses the RPC pagination contract for next and previous pages", async () => {
    const user = userEvent.setup()
    queryMocks.useSnapshot.mockImplementation((page: number) => ({
      data: {
        ...snapshot([product({ productId: `product-${page}`, productName: `Product page ${page}` })]),
        pagination: { page, pageSize: 2, totalItems: 4, totalPages: 2 },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }))

    renderPage()
    expect(screen.getByText("Product page 1")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next Smart Inventory page" }))
    expect(queryMocks.useSnapshot).toHaveBeenLastCalledWith(2, 2)
    expect(screen.getByText("Product page 2")).toBeInTheDocument()
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Previous Smart Inventory page" }))
    expect(queryMocks.useSnapshot).toHaveBeenLastCalledWith(1, 2)
  })

  it("shows empty, loading, and retryable error states", async () => {
    queryMocks.useSnapshot.mockReturnValue({ data: snapshot([]), isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })
    renderPage()
    expect(screen.getByText("No active products to analyze.")).toBeInTheDocument()

    queryMocks.useSnapshot.mockReturnValue({ data: undefined, isLoading: true, isError: false, isFetching: true, refetch: vi.fn() })
    renderPage()
    expect(screen.getByRole("status")).toHaveTextContent(/loading smart inventory/i)

    const refetch = vi.fn()
    queryMocks.useSnapshot.mockReturnValue({ data: undefined, isLoading: false, isError: true, isFetching: false, refetch })
    renderPage()
    expect(screen.getByRole("alert")).toHaveTextContent(/smart inventory unavailable/i)
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
