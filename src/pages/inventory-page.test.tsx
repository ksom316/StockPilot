import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"

const inventoryMocks = vi.hoisted(() => ({ useCatalog: vi.fn(), useMutations: vi.fn() }))

vi.mock("@/features/inventory/inventory-queries", () => ({
  useInventoryCatalog: inventoryMocks.useCatalog,
  useInventoryMutations: inventoryMocks.useMutations,
}))

import { InventoryPage } from "@/pages/inventory-page"
import { createBusinessValue, testBusiness, testMembership, TestBusinessProvider } from "@/test/auth-test-utils"

const categories = [
  { id: "cat-1", name: "Electronics", description: null },
  { id: "cat-2", name: "Accessories", description: null },
]
const products = [
  { id: "p1", businessId: "business-1", categoryId: "cat-1", categoryName: "Electronics", name: "Barcode Scanner", sku: "SCAN-1", description: null, costPrice: "20", sellingPrice: "35", baseUnit: "piece", purchaseUnit: "piece", purchaseConversionQuantity: "1", currentQuantity: "4", lowStockThreshold: "5", isActive: true },
  { id: "p2", businessId: "business-1", categoryId: "cat-2", categoryName: "Accessories", name: "USB Cable", sku: "USB-9", description: null, costPrice: "2", sellingPrice: "5", baseUnit: "piece", purchaseUnit: "pack", purchaseConversionQuantity: "5", currentQuantity: "0", lowStockThreshold: "2", isActive: true },
]

function queryResult<T>(data: T) {
  return { data, isLoading: false, isError: false, refetch: vi.fn() }
}

function renderInventory(role: "owner" | "manager" | "employee" | "cashier" = "owner", path = "/inventory") {
  return render(
    <MemoryRouter initialEntries={[path]}><TestBusinessProvider value={createBusinessValue({ business: testBusiness, membership: { ...testMembership, role }, role, onboardingRequired: false })}>
      <InventoryPage />
    </TestBusinessProvider></MemoryRouter>,
  )
}

describe("InventoryPage", () => {
  beforeEach(() => {
    inventoryMocks.useCatalog.mockReturnValue({ business: testBusiness, categories: queryResult(categories), products: queryResult(products) })
    inventoryMocks.useMutations.mockReturnValue({
      createProduct: { mutateAsync: vi.fn() }, updateProduct: { mutateAsync: vi.fn() },
      createCategory: { mutateAsync: vi.fn() }, updateCategory: { mutateAsync: vi.fn() },
      recordMovement: { mutateAsync: vi.fn() },
    })
  })

  it("shows a useful empty catalog state", () => {
    inventoryMocks.useCatalog.mockReturnValue({ business: testBusiness, categories: queryResult([]), products: queryResult([]) })
    renderInventory()
    expect(screen.getByRole("heading", { name: /no products yet/i })).toBeInTheDocument()
    expect(screen.getByText(/start with zero stock/i)).toBeInTheDocument()
  })

  it("searches by SKU and product name", async () => {
    const user = userEvent.setup()
    renderInventory()
    await user.type(screen.getByRole("searchbox", { name: /search products/i }), "USB-9")
    expect(screen.getAllByText("USB Cable").length).toBeGreaterThan(0)
    expect(screen.queryByText("Barcode Scanner")).not.toBeInTheDocument()
  })

  it("filters products by category", async () => {
    const user = userEvent.setup()
    renderInventory()
    await user.selectOptions(screen.getByRole("combobox", { name: /filter by category/i }), "cat-1")
    expect(screen.getAllByText("Barcode Scanner").length).toBeGreaterThan(0)
    expect(screen.queryByText("USB Cable")).not.toBeInTheDocument()
  })

  it("filters by stock attention and provides per-product movement history", async () => {
    const user = userEvent.setup()
    renderInventory("cashier")
    await user.selectOptions(screen.getByRole("combobox", { name: /filter by stock attention/i }), "attention")
    expect(screen.getAllByText("Barcode Scanner").length).toBeGreaterThan(0)
    expect(screen.getAllByText("USB Cable").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("link", { name: /view stock history for barcode scanner/i })[0]).toHaveAttribute("href", "/inventory/movements?productId=p1")
  })

  it("initializes stock attention from the URL and treats invalid values as all stock", () => {
    const { unmount } = renderInventory("owner", "/inventory?stock=attention")
    expect(screen.getAllByText("Barcode Scanner").length).toBeGreaterThan(0)
    expect(screen.getAllByText("USB Cable").length).toBeGreaterThan(0)
    unmount()
    renderInventory("owner", "/inventory?stock=bogus")
    expect(screen.getAllByText("Barcode Scanner").length).toBeGreaterThan(0)
    expect(screen.getAllByText("USB Cable").length).toBeGreaterThan(0)
  })

  it("allows an inventory staff role to open product creation", async () => {
    const user = userEvent.setup()
    renderInventory("employee")
    await user.click(screen.getByRole("button", { name: /add product/i }))
    expect(screen.getByRole("dialog", { name: /add product/i })).toBeInTheDocument()
  })

  it.each(["owner", "manager", "employee"] as const)("allows %s to access stock actions", async (role) => {
    const user = userEvent.setup()
    renderInventory(role)
    await user.click(screen.getAllByRole("button", { name: /manage stock for barcode scanner/i })[0])
    expect(screen.getByRole("dialog", { name: /manage stock/i })).toBeInTheDocument()
  })

  it("keeps cashier catalog access read-only", () => {
    renderInventory("cashier")
    expect(screen.getAllByText("Barcode Scanner").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /add product/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /categories/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /edit barcode scanner/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /manage stock/i })).not.toBeInTheDocument()
  })
})
