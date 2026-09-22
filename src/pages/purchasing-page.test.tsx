import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Product } from "@/features/inventory/inventory-types"
import type { Supplier } from "@/features/purchasing/purchasing-types"
import { PurchasingPage } from "@/pages/purchasing-page"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  products: { data: [] as Product[], isLoading: false, isError: false, refetch: vi.fn() },
  suppliers: { data: [] as Supplier[], isLoading: false, isError: false },
}))

vi.mock("@/features/inventory/inventory-queries", () => ({ useInventoryProducts: () => mocks.products }))
vi.mock("@/features/purchasing/purchasing-queries", () => ({
  usePurchasingSuppliers: () => mocks.suppliers,
  useRecordPurchase: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}))

const products: Product[] = [
  { id: "p1", businessId: "business-1", categoryId: null, categoryName: null, name: "Coffee Beans", sku: "COF-1", description: null, costPrice: "4.1250", sellingPrice: "10.25", currentQuantity: "8.5", lowStockThreshold: "1", isActive: true },
  { id: "p2", businessId: "business-1", categoryId: null, categoryName: null, name: "Tea", sku: "TEA-1", description: null, costPrice: "0", sellingPrice: "5", currentQuantity: "3", lowStockThreshold: "1", isActive: true },
  { id: "p3", businessId: "business-1", categoryId: null, categoryName: null, name: "Inactive", sku: "OFF-1", description: null, costPrice: "1", sellingPrice: "1", currentQuantity: "10", lowStockThreshold: "1", isActive: false },
]

const suppliers: Supplier[] = [
  { id: "s1", name: "Local Supply", contactName: null, phone: null, email: null },
  { id: "s2", name: "Wholesale House", contactName: null, phone: null, email: null },
]

function renderPurchasing() {
  return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, enabledModules: ["purchasing"] })}><MemoryRouter><PurchasingPage /></MemoryRouter></TestBusinessProvider>)
}

describe("purchasing receiving page", () => {
  beforeEach(() => {
    let nextRequest = 0
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `request-${++nextRequest}`) })
    mocks.products = { data: products, isLoading: false, isError: false, refetch: vi.fn() }
    mocks.suppliers = { data: suppliers, isLoading: false, isError: false }
    mocks.mutateAsync.mockReset()
  })

  it("allows receiving without any suppliers and only offers active products", async () => {
    const user = userEvent.setup()
    mocks.suppliers = { data: [], isLoading: false, isError: false }
    mocks.mutateAsync.mockResolvedValue({ id: "purchase-1", purchase_reference: "PUR-000001" })
    renderPurchasing()
    expect(screen.getByRole("option", { name: /no supplier \/ unspecified/i })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Inactive/ })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    expect(screen.getByLabelText(/unit cost/i)).toHaveValue("4.1250")
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    await user.click(screen.getByRole("button", { name: /record receipt/i }))
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      items: [{ product_id: "p1", quantity: "1", unit_cost: "4.125" }],
      requestId: "request-1",
      supplierId: null,
      notes: null,
    })
    expect(await screen.findByText("PUR-000001")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /view purchase/i })).toHaveAttribute("href", "/purchasing/purchase-1")
  })

  it("searches by product name and SKU and lets the user select a supplier", async () => {
    const user = userEvent.setup()
    mocks.mutateAsync.mockResolvedValue({ id: "purchase-3", purchase_reference: "PUR-000003" })
    renderPurchasing()
    await user.type(screen.getByRole("searchbox", { name: /search products/i }), "COF-1")
    expect(screen.getByRole("option", { name: /Coffee Beans/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Tea/ })).not.toBeInTheDocument()
    await user.clear(screen.getByRole("searchbox", { name: /search products/i }))
    await user.type(screen.getByRole("searchbox", { name: /search products/i }), "tea")
    expect(screen.getByRole("option", { name: /Tea/ })).toBeInTheDocument()
    await user.clear(screen.getByRole("searchbox", { name: /search products/i }))
    await user.clear(screen.getByPlaceholderText("Search suppliers"))
    await user.type(screen.getByPlaceholderText("Search suppliers"), "wholesale")
    await user.selectOptions(screen.getByLabelText("Supplier"), "s2")
    expect(screen.getByLabelText("Supplier")).toHaveValue("s2")
    await user.selectOptions(screen.getByLabelText(/^product$/i), "p1")
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    await user.click(screen.getByRole("button", { name: /record receipt/i }))
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ supplierId: "s2" }))
  })

  it("validates quantity and cost, accepts zero cost, upserts duplicate products, edits and removes lines", async () => {
    const user = userEvent.setup()
    renderPurchasing()
    await user.selectOptions(screen.getByLabelText(/^product$/i), "p1")
    fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: "0" } })
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    expect(screen.getByText(/quantity greater than zero/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: "1.0001" } })
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    expect(screen.getByText("Enter a quantity greater than zero with up to 3 decimal places.")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: "2" } })
    fireEvent.change(screen.getByLabelText(/unit cost/i), { target: { value: "-1" } })
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    expect(screen.getByText(/unit cost of zero or more/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/unit cost/i), { target: { value: "0" } })
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    expect(screen.queryByText("Subtotal")).not.toBeInTheDocument()
    expect(screen.getByText("Receipt total").parentElement).toHaveTextContent("US$0.00")
    expect(screen.getByRole("list", { name: /items in current receipt/i }).querySelectorAll("li")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: /edit coffee beans/i }))
    fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: "3" } })
    await user.click(screen.getByRole("button", { name: /update item in receipt/i }))
    expect(screen.getByRole("list", { name: /items in current receipt/i }).querySelectorAll("li")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: /remove coffee beans/i }))
    expect(screen.queryByRole("list", { name: /items in current receipt/i })).not.toBeInTheDocument()
  })

  it("computes exact totals, does not update catalog cost directly, and blocks overflow", async () => {
    const user = userEvent.setup()
    renderPurchasing()
    await user.selectOptions(screen.getByLabelText(/^product$/i), "p1")
    fireEvent.change(screen.getByLabelText(/quantity received/i), { target: { value: "2.125" } })
    fireEvent.change(screen.getByLabelText(/unit cost/i), { target: { value: "50.1234" } })
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    expect(screen.getByText("Receipt total").parentElement).toHaveTextContent("US$106.51")
    expect(screen.getByRole("list", { name: /items in current receipt/i })).toHaveTextContent(/2\.125.*US\$50\.1234.*US\$106\.5122/)
    await user.click(screen.getByRole("button", { name: /record receipt/i }))
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ items: [{ product_id: "p1", quantity: "2.125", unit_cost: "50.1234" }] }))
    expect(mocks.mutateAsync.mock.calls[0][0].items[0]).not.toHaveProperty("cost_price")

    cleanup()
    mocks.mutateAsync.mockReset()
    mocks.products = { data: products.map((product) => product.id === "p1" ? { ...product, currentQuantity: "999999999999999.999" } : product), isLoading: false, isError: false, refetch: vi.fn() }
    renderPurchasing()
    await user.selectOptions(screen.getByLabelText(/^product$/i), "p1")
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    expect(screen.getByText(/maximum supported stock balance/i)).toBeInTheDocument()
  })

  it("retains request ID on retry, creates a new ID after edits, and resets after success", async () => {
    const user = userEvent.setup()
    mocks.mutateAsync.mockRejectedValueOnce(new Error("Temporary network failure"))
    mocks.mutateAsync.mockResolvedValue({ id: "purchase-2", purchase_reference: "PUR-000002" })
    renderPurchasing()
    await user.selectOptions(screen.getByLabelText(/^product$/i), "p1")
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    await user.click(screen.getByRole("button", { name: /record receipt/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Temporary network failure")
    expect(screen.getByRole("list", { name: /items in current receipt/i })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /record receipt/i }))
    expect(mocks.mutateAsync.mock.calls[0][0].requestId).toBe(mocks.mutateAsync.mock.calls[1][0].requestId)
    expect(await screen.findByText("PUR-000002")).toBeInTheDocument()
    expect(screen.getByText("Your receipt is empty")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /receive more stock/i }))
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    await user.click(screen.getByRole("button", { name: /record receipt/i }))
    const nextRequestId = mocks.mutateAsync.mock.calls[2][0].requestId
    expect(nextRequestId).not.toBe(mocks.mutateAsync.mock.calls[1][0].requestId)

    cleanup()
    mocks.mutateAsync.mockReset()
    mocks.mutateAsync.mockRejectedValueOnce(new Error("Temporary network failure"))
    renderPurchasing()
    await user.selectOptions(screen.getAllByLabelText("Product").at(-1)!, "p1")
    await user.click(screen.getAllByRole("button", { name: /add to receipt/i }).at(-1)!)
    await user.click(screen.getAllByRole("button", { name: /record receipt/i }).at(-1)!)
    await screen.findByRole("alert")
    fireEvent.change(screen.getAllByLabelText(/receipt note/i).at(-1)!, { target: { value: "changed receipt" } })
    await user.click(screen.getAllByRole("button", { name: /record receipt/i }).at(-1)!)
    expect(mocks.mutateAsync.mock.calls[1][0].requestId).not.toBe(mocks.mutateAsync.mock.calls[0][0].requestId)
  })

  it("prevents double submission and preserves receipt lines after failure", async () => {
    const user = userEvent.setup()
    let resolveRequest: ((value: { id: string; purchase_reference: string }) => void) | undefined
    mocks.mutateAsync.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
    renderPurchasing()
    await user.selectOptions(screen.getByLabelText(/^product$/i), "p1")
    await user.click(screen.getByRole("button", { name: /add to receipt/i }))
    const button = screen.getByRole("button", { name: /record receipt/i })
    await user.click(button)
    await user.click(button)
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1)
    resolveRequest?.({ id: "p1", purchase_reference: "PUR-1" })
    await waitFor(() => expect(screen.getByText("Your receipt is empty")).toBeInTheDocument())
  })
})
