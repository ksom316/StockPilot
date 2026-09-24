import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Product } from "@/features/inventory/inventory-types"
import { SalesCheckoutPage } from "@/pages/sales-checkout-page"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const salesMocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }))
const inventoryMocks = vi.hoisted(() => ({ data: [] as Product[], isLoading: false, isError: false, refetch: vi.fn() }))
const customerMocks = vi.hoisted(() => ({ data: [] as Array<{ id: string; name: string; phone: string | null; email: string | null; isActive: boolean }>, create: { mutateAsync: vi.fn(), isPending: false } }))

vi.mock("@/features/inventory/inventory-queries", () => ({
  useInventoryProducts: () => inventoryMocks,
}))
vi.mock("@/features/sales/sales-queries", () => ({
  useRecordSale: () => ({ mutateAsync: salesMocks.mutateAsync, isPending: false }),
}))
vi.mock("@/features/customers/customer-queries", () => ({
  useCustomerLookup: () => ({ data: customerMocks.data, isError: false }),
  useCustomerMutations: () => ({ create: customerMocks.create }),
}))

const products: Product[] = [
  { id: "p1", businessId: "business-1", categoryId: null, categoryName: null, name: "Coffee Beans", sku: "COF-1", description: null, costPrice: "4", sellingPrice: "10.25", baseUnit: "kg", purchaseUnit: "carton", purchaseConversionQuantity: "10", currentQuantity: "8.5", lowStockThreshold: "1", isActive: true },
  { id: "p2", businessId: "business-1", categoryId: null, categoryName: null, name: "Tea", sku: "TEA-1", description: null, costPrice: "2", sellingPrice: "5", baseUnit: "pack", purchaseUnit: "pack", purchaseConversionQuantity: "1", currentQuantity: "3", lowStockThreshold: "1", isActive: true },
  { id: "p3", businessId: "business-1", categoryId: null, categoryName: null, name: "Inactive", sku: "OFF-1", description: null, costPrice: "1", sellingPrice: "1", baseUnit: "piece", purchaseUnit: "piece", purchaseConversionQuantity: "1", currentQuantity: "10", lowStockThreshold: "1", isActive: false },
]

function renderCheckout() {
  return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, enabledModules: ["sales"] })}><MemoryRouter><SalesCheckoutPage /></MemoryRouter></TestBusinessProvider>)
}

describe("sales checkout", () => {
  beforeEach(() => {
    inventoryMocks.data = products
    inventoryMocks.isLoading = false
    inventoryMocks.isError = false
    salesMocks.mutateAsync.mockReset()
    customerMocks.data = []
    customerMocks.create.mutateAsync.mockReset()
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
    await user.click(screen.getByRole("button", { name: "Coffee Beans" }))
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "3" } })
    await user.click(screen.getByRole("button", { name: /update item in sale/i }))
    expect(screen.getByRole("list", { name: /items in current sale/i }).querySelectorAll("li")).toHaveLength(1)
    expect(screen.getByText("Subtotal").parentElement).toHaveTextContent("US$28.50")
    await user.click(screen.getByRole("button", { name: /record sale/i }))
    expect(salesMocks.mutateAsync).toHaveBeenCalledWith({ items: [{ product_id: "p1", quantity: "3", unit_price: "9.5" }], notes: null, customerId: null, salesChannel: "walk_in", paymentMethod: "cash" })
    expect(await screen.findByText("S-2026-0001")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View sale" })).toHaveAttribute("href", "/sales/sale-1")
    await user.click(screen.getByRole("button", { name: "New sale" }))
    expect(screen.queryByText("S-2026-0001")).not.toBeInTheDocument()
    expect(screen.getByText("Your sale is empty")).toBeInTheDocument()
  })

  it("keeps channel separate from payment and supports cancel editing", async () => {
    const user = userEvent.setup()
    salesMocks.mutateAsync.mockResolvedValue({ id: "sale-1", sale_reference: "S-2026-0001" })
    renderCheckout()
    await user.selectOptions(screen.getByLabelText("Sales channel"), "delivery")
    await user.selectOptions(screen.getByLabelText("Payment method"), "mobile_money")
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    await user.click(screen.getByRole("button", { name: "Coffee Beans" }))
    expect(screen.getByRole("button", { name: /cancel editing/i })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /cancel editing/i }))
    expect(screen.getByRole("button", { name: /add to sale/i })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /record sale/i }))
    expect(salesMocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ salesChannel: "delivery", paymentMethod: "mobile_money" }))
  })

  it("selects a basic customer at checkout and sends only its ID with the sale", async () => {
    const user = userEvent.setup()
    customerMocks.data = [{ id: "customer-1", name: "Avery Example", phone: "555-0100", email: "avery@example.test", isActive: true }]
    salesMocks.mutateAsync.mockResolvedValue({ id: "sale-1", sale_reference: "S-2026-0001" })
    render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, enabledModules: ["sales", "customers"] })}><MemoryRouter><SalesCheckoutPage /></MemoryRouter></TestBusinessProvider>)
    expect(screen.getByRole("option", { name: "No customer" })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Sale customer"), "customer-1")
    expect(screen.getByRole("button", { name: /no customer/i })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /no customer/i }))
    expect(screen.getByLabelText("Sale customer")).toHaveValue("")
    await user.selectOptions(screen.getByLabelText("Sale customer"), "customer-1")
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    await user.click(screen.getByRole("button", { name: /record sale/i }))
    expect(salesMocks.mutateAsync).toHaveBeenCalledWith({ items: [{ product_id: "p1", quantity: "1", unit_price: "10.25" }], notes: null, customerId: "customer-1", salesChannel: "walk_in", paymentMethod: "cash" })
  })

  it.each(["owner", "manager", "employee", "cashier"] as const)("quick-creates a minimal customer as %s without automatically recording the sale", async (role) => {
    const user = userEvent.setup()
    customerMocks.create.mutateAsync.mockResolvedValue("customer-created")
    render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules: ["sales", "customers"] })}><MemoryRouter><SalesCheckoutPage /></MemoryRouter></TestBusinessProvider>)
    expect(screen.queryByLabelText(/private note/i)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    await user.click(screen.getByRole("button", { name: /add customer/i }))
    await user.type(screen.getByLabelText("Name *"), "Morgan Buyer")
    await user.click(screen.getByRole("button", { name: /create and select/i }))
    expect(customerMocks.create.mutateAsync).toHaveBeenCalledWith({ name: "Morgan Buyer", phone: null, email: null, note: null })
    expect(await screen.findByRole("button", { name: /no customer/i })).toBeInTheDocument()
    expect(screen.getByRole("list", { name: /items in current sale/i }).querySelectorAll("li")).toHaveLength(1)
    expect(salesMocks.mutateAsync).not.toHaveBeenCalled()
  })

  it("hides customer controls when Customers is disabled", () => {
    renderCheckout()
    expect(screen.queryByRole("heading", { name: "Customer" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Sale customer")).not.toBeInTheDocument()
  })

  it("clears a selected customer when the business changes and keeps the cart", async () => {
    const user = userEvent.setup()
    customerMocks.data = [{ id: "customer-1", name: "Avery Example", phone: null, email: null, isActive: true }]
    const valueA = createBusinessValue({ business: testBusiness, enabledModules: ["sales", "customers"] })
    const view = render(<TestBusinessProvider value={valueA}><MemoryRouter><SalesCheckoutPage /></MemoryRouter></TestBusinessProvider>)
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    await user.selectOptions(screen.getByLabelText("Sale customer"), "customer-1")
    const valueB = createBusinessValue({ business: { ...testBusiness, id: "business-2" }, enabledModules: ["sales", "customers"] })
    view.rerender(<TestBusinessProvider value={valueB}><MemoryRouter><SalesCheckoutPage /></MemoryRouter></TestBusinessProvider>)
    expect(screen.getByLabelText("Sale customer")).toHaveValue("")
    expect(screen.getByRole("list", { name: /items in current sale/i }).querySelectorAll("li")).toHaveLength(1)
  })

  it.each(["555-0100", "avery@example.test"])("filters active checkout customers by phone or email (%s)", async (term) => {
    const user = userEvent.setup()
    customerMocks.data = [
      { id: "customer-1", name: "Avery Example", phone: "555-0100", email: "avery@example.test", isActive: true },
      { id: "customer-inactive", name: "Inactive", phone: "555-9999", email: "old@example.test", isActive: false },
    ]
    render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, enabledModules: ["sales", "customers"] })}><MemoryRouter><SalesCheckoutPage /></MemoryRouter></TestBusinessProvider>)
    await user.type(screen.getByRole("searchbox", { name: /search customers/i }), term)
    expect(screen.getByRole("option", { name: /Avery Example/ })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Inactive/ })).not.toBeInTheDocument()
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

  it("does not add a line that would exceed the database total precision", async () => {
    const user = userEvent.setup()
    inventoryMocks.data = products.map((product) => product.id === "p1" || product.id === "p2"
      ? { ...product, sellingPrice: "999999999999999.9999", currentQuantity: "10" }
      : product)
    renderCheckout()
    await user.selectOptions(screen.getByLabelText("Product"), "p1")
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    await user.selectOptions(screen.getByLabelText("Product"), "p2")
    await user.click(screen.getByRole("button", { name: /add to sale/i }))
    expect(screen.getByRole("alert")).toHaveTextContent(/adding this item would exceed/i)
    expect(screen.getByRole("list", { name: /items in current sale/i }).querySelectorAll("li")).toHaveLength(1)
  })
})
