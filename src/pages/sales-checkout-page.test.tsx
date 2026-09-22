import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Product } from "@/features/inventory/inventory-types"
import { SalesCheckoutPage } from "@/pages/sales-checkout-page"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const salesMocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }))
const inventoryMocks = vi.hoisted(() => ({ data: [] as Product[], isLoading: false, isError: false, refetch: vi.fn() }))

vi.mock("@/features/inventory/inventory-queries", () => ({
  useInventoryProducts: () => inventoryMocks,
}))
vi.mock("@/features/sales/sales-queries", () => ({
  useRecordSale: () => ({ mutateAsync: salesMocks.mutateAsync, isPending: false }),
}))

const products: Product[] = [
  { id: "p1", businessId: "business-1", categoryId: null, categoryName: null, name: "Coffee Beans", sku: "COF-1", description: null, costPrice: "4", sellingPrice: "10.25", currentQuantity: "8.5", lowStockThreshold: "1", isActive: true },
  { id: "p2", businessId: "business-1", categoryId: null, categoryName: null, name: "Tea", sku: "TEA-1", description: null, costPrice: "2", sellingPrice: "5", currentQuantity: "3", lowStockThreshold: "1", isActive: true },
  { id: "p3", businessId: "business-1", categoryId: null, categoryName: null, name: "Inactive", sku: "OFF-1", description: null, costPrice: "1", sellingPrice: "1", currentQuantity: "10", lowStockThreshold: "1", isActive: false },
]

function renderCheckout() {
  return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, enabledModules: ["sales"] })}><SalesCheckoutPage /></TestBusinessProvider>)
}

describe("sales checkout", () => {
  beforeEach(() => {
    inventoryMocks.data = products
    inventoryMocks.isLoading = false
    inventoryMocks.isError = false
    salesMocks.mutateAsync.mockReset()
  })

  it("searches active products by SKU or name and validates stock and price", async () => {
    const user = userEvent.setup()
    renderCheckout()
    expect(screen.queryByRole("option", { name: /Inactive/ })).not.toBeInTheDocument()
    await user.type(screen.getByRole("searchbox", { name: /search products/i }), "TEA-1")
    expect(screen.getByRole("option", { name: /Tea/ })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Product"), "p2")
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "4" } })
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    expect(await screen.findByText(/quantity exceeds the available stock/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "1" } })
    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: "2.12345" } })
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    expect(await screen.findByText(/up to 4 decimal places/i)).toBeInTheDocument()
  })

  it("adds one row per product, permits price override, calculates totals and records sale", async () => {
    const user = userEvent.setup()
    salesMocks.mutateAsync.mockResolvedValue({ id: "sale-1", sale_reference: "S-2026-0001" })
    renderCheckout()
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "2" } })
    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: "9.5" } })
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    expect(screen.getByText("Subtotal").parentElement).toHaveTextContent("US$19.00")
    await user.click(screen.getByRole("button", { name: /edit coffee beans/i }))
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "3" } })
    await user.click(screen.getByRole("button", { name: /update item in sale/i }))
    expect(screen.getByRole("list", { name: /items in current sale/i }).querySelectorAll("li")).toHaveLength(1)
    expect(screen.getByText("Subtotal").parentElement).toHaveTextContent("US$28.50")
    await user.click(screen.getByRole("button", { name: /record sale/i }))
    expect(salesMocks.mutateAsync).toHaveBeenCalledWith({ items: [{ product_id: "p1", quantity: "3", unit_price: "9.5" }], notes: null })
    expect(await screen.findByText("S-2026-0001")).toBeInTheDocument()
    expect(screen.getByText("Your sale is empty")).toBeInTheDocument()
  })

  it("preserves the cart when recording fails and can remove an item", async () => {
    const user = userEvent.setup()
    salesMocks.mutateAsync.mockRejectedValue(new Error("There isn't enough stock"))
    renderCheckout()
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    await user.click(screen.getByRole("button", { name: /record sale/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent("There isn't enough stock")
    expect(screen.getByRole("list", { name: /items in current sale/i })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /remove coffee beans/i }))
    expect(screen.queryByRole("list", { name: /items in current sale/i })).not.toBeInTheDocument()
  })

  it("prevents repeated submission while the first request is unresolved", async () => {
    const user = userEvent.setup()
    let finishRequest: ((sale: { id: string; sale_reference: string }) => void) | undefined
    salesMocks.mutateAsync.mockImplementation(() => new Promise((resolve) => { finishRequest = resolve }))
    renderCheckout()
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    const recordButton = screen.getByRole("button", { name: /record sale/i })
    await user.click(recordButton)
    await user.click(recordButton)
    expect(salesMocks.mutateAsync).toHaveBeenCalledTimes(1)
    finishRequest?.({ id: "sale-1", sale_reference: "S-ONE" })
  })
})
