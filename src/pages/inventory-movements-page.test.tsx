import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

const movementMocks = vi.hoisted(() => ({ useMovements: vi.fn() }))

vi.mock("@/features/inventory/inventory-queries", () => ({ useInventoryMovements: movementMocks.useMovements }))

import { InventoryMovementsPage } from "@/pages/inventory-movements-page"

const sampleMovements = [
  { id: "m1", businessId: "b1", productId: "00000000-0000-4000-8000-000000000001", productName: "Barcode Scanner", productSku: "SCAN-1", movementType: "stock_in", quantity: "10", quantityBefore: "0", quantityAfter: "10", reason: "Opening count", actorUserId: "u1", sourceType: "manual", sourceReference: null, createdAt: "2026-09-20T12:00:00.000Z" },
  { id: "m2", businessId: "b1", productId: "00000000-0000-4000-8000-000000000001", productName: "Barcode Scanner", productSku: "SCAN-1", movementType: "stock_out", quantity: "-2.5", quantityBefore: "10", quantityAfter: "7.5", reason: null, actorUserId: "u1", sourceType: "manual", sourceReference: null, createdAt: "2026-09-21T12:00:00.000Z" },
  { id: "m3", businessId: "b1", productId: "00000000-0000-4000-8000-000000000002", productName: "USB Cable", productSku: "USB-9", movementType: "damaged", quantity: "-1", quantityBefore: "2", quantityAfter: "1", reason: "Damaged box", actorUserId: null, sourceType: "system", sourceReference: null, createdAt: "2026-09-22T12:00:00.000Z" },
]

function renderHistory(path = "/inventory/movements") {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<InventoryMovementsPage />} path="/inventory/movements" /></Routes></MemoryRouter>)
}

describe("InventoryMovementsPage", () => {
  beforeEach(() => movementMocks.useMovements.mockReturnValue({ data: sampleMovements, isLoading: false, isError: false, refetch: vi.fn() }))

  it("shows a read-only history with signed changes and running balances", () => {
    renderHistory()
    expect(screen.getByRole("heading", { name: /movement history/i })).toBeInTheDocument()
    expect(screen.getAllByText("+10").length).toBeGreaterThan(0)
    expect(screen.getAllByText("−2.5").length).toBeGreaterThan(0)
    expect(screen.getAllByText("7.5").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Team member")).toHaveLength(2)
    expect(screen.getAllByText("System").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /add|edit|stock in|stock out/i })).not.toBeInTheDocument()
  })

  it("applies product, movement type, and text filters", async () => {
    const user = userEvent.setup()
    renderHistory()
    await user.selectOptions(screen.getByRole("combobox", { name: /filter by movement type/i }), "damaged")
    expect(screen.getAllByText("Damaged").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("Barcode Scanner")).toHaveLength(0)
    await user.selectOptions(screen.getByRole("combobox", { name: /filter by product/i }), "00000000-0000-4000-8000-000000000002")
    expect(screen.getAllByText("USB Cable").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("Barcode Scanner")).toHaveLength(0)
    await user.clear(screen.getByRole("searchbox", { name: /search product name or sku/i }))
    await user.type(screen.getByRole("searchbox", { name: /search product name or sku/i }), "NO-MATCH")
    expect(screen.getByRole("heading", { name: /no matching movements/i })).toBeInTheDocument()
  })

  it("honors product-specific history links", () => {
    renderHistory("/inventory/movements?productId=00000000-0000-4000-8000-000000000001")
    expect(screen.getAllByText("Barcode Scanner").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("USB Cable")).toHaveLength(0)
  })

  it("ignores invalid filter parameters safely", () => {
    renderHistory("/inventory/movements?productId=not-a-uuid&type=not-a-movement&from=2026-99-99")
    expect(screen.getAllByText("Barcode Scanner").length).toBeGreaterThan(0)
    expect(screen.getAllByText("USB Cable").length).toBeGreaterThan(0)
  })
})
