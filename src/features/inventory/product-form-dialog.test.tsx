import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { InventoryDataError } from "@/features/inventory/inventory-service"
import { ProductFormDialog } from "@/features/inventory/product-form-dialog"
import type { Product } from "@/features/inventory/inventory-types"

describe("ProductFormDialog", () => {
  it("validates required product details and numeric precision", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ProductFormDialog categories={[]} currency="USD" onClose={vi.fn()} onSubmit={onSubmit} />)
    const dialog = screen.getByRole("dialog")
    await user.clear(within(dialog).getByLabelText(/cost \(USD\)/i))
    await user.type(within(dialog).getByLabelText(/cost \(USD\)/i), "1.12345")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(within(dialog).getByText("Enter a product name.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/sku \(optional\)/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/enter what one not specified costs/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("shows a useful duplicate SKU error", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new InventoryDataError("duplicate", "23505"))
    render(<ProductFormDialog categories={[]} currency="USD" onClose={vi.fn()} onSubmit={onSubmit} />)
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText(/product name/i), "USB Cable")
    await user.type(within(dialog).getByLabelText(/sku \(optional\)/i), "USB-1")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(await within(dialog).findByText(/sku is already used/i)).toBeInTheDocument()
  })

  it("captures purchase-to-selling-unit conversion and rejects zero", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={onSubmit} />)
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText(/product name/i), "Chicken Wings")
    await user.selectOptions(within(dialog).getByLabelText(/i sell this product by/i), "kg")
    await user.selectOptions(within(dialog).getByLabelText(/i buy this product by/i), "carton")
    await user.clear(within(dialog).getByLabelText(/cost per carton/i))
    await user.type(within(dialog).getByLabelText(/cost per carton/i), "300")
    await user.clear(within(dialog).getByLabelText(/selling price per kg/i))
    await user.type(within(dialog).getByLabelText(/selling price per kg/i), "40")
    await user.clear(within(dialog).getByLabelText(/one carton contains/i))
    await user.type(within(dialog).getByLabelText(/one carton contains/i), "0")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(within(dialog).getByLabelText(/one carton contains/i)).toHaveAttribute("aria-invalid", "true")

    await user.clear(within(dialog).getByLabelText(/one carton contains/i))
    await user.type(within(dialog).getByLabelText(/one carton contains/i), "10")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ baseUnit: "kg", purchaseUnit: "carton", purchaseConversionQuantity: "10", costPrice: "30" }))
    expect(within(dialog).getByText(/GHS 30(?:\.00)? per kg/i)).toBeInTheDocument()
  })

  it("shows independent bulk pricing and a below-cost warning", async () => {
    const user = userEvent.setup()
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={vi.fn()} />)
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText(/product name/i), "Chicken Wings")
    await user.clear(within(dialog).getByLabelText(/cost \(GHS\)/i))
    await user.type(within(dialog).getByLabelText(/cost \(GHS\)/i), "30")
    await user.selectOptions(within(dialog).getByLabelText(/i sell this product by/i), "kg")
    await user.clear(within(dialog).getByLabelText(/selling price per kg/i))
    await user.type(within(dialog).getByLabelText(/selling price per kg/i), "28")
    expect(within(dialog).getByText(/below your cost of GHS 30/i)).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText(/i buy this product by/i), "carton")
    await user.clear(within(dialog).getByLabelText(/one carton contains/i))
    await user.type(within(dialog).getByLabelText(/one carton contains/i), "10")
    await user.click(within(dialog).getByRole("button", { name: /add another selling option/i }))
    await user.type(within(dialog).getByLabelText(/i sell by/i), "carton")
    await user.clear(within(dialog).getAllByLabelText(/one carton contains/i).at(-1)!)
    await user.type(within(dialog).getAllByLabelText(/one carton contains/i).at(-1)!, "10")
    await user.clear(within(dialog).getByLabelText(/price per carton \(GHS\)/i))
    await user.type(within(dialog).getByLabelText(/price per carton \(GHS\)/i), "370")
    expect(within(dialog).getAllByText(/one carton contains 10 kg/i).length).toBeGreaterThan(0)
  })

  it("keeps current quantity read-only while editing", () => {
    const product = { id: "p1", businessId: "b1", categoryId: null, categoryName: null, name: "Cable", sku: "C1", description: null, costPrice: "1", sellingPrice: "2", baseUnit: "piece", purchaseUnit: "carton", purchaseConversionQuantity: "12", currentQuantity: "7.500", lowStockThreshold: "2", isActive: true } satisfies Product
    render(<ProductFormDialog categories={[]} currency="USD" onClose={vi.fn()} onSubmit={vi.fn()} product={product} />)
    expect(screen.getByText(/current quantity:/i)).toHaveTextContent("7.5")
    expect(screen.queryByRole("textbox", { name: /current quantity/i })).not.toBeInTheDocument()
  })

  it("shows conversion guidance and a purchase-unit cost label for different units", async () => {
    const user = userEvent.setup()
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={vi.fn()} />)
    const dialog = screen.getByRole("dialog")
    await user.selectOptions(within(dialog).getByLabelText(/i sell this product by/i), "kg")
    await user.selectOptions(within(dialog).getByLabelText(/i buy this product by/i), "carton")
    expect(within(dialog).getByLabelText(/cost per carton \(GHS\)/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/one carton contains/i)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/one carton contains/i).length).toBeGreaterThan(0)
  })

  it("hides conversion controls when selling and purchase units match", async () => {
    const user = userEvent.setup()
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={vi.fn()} />)
    const dialog = screen.getByRole("dialog")
    await user.selectOptions(within(dialog).getByLabelText(/i sell this product by/i), "piece")
    await user.selectOptions(within(dialog).getByLabelText(/i buy this product by/i), "piece")
    expect(within(dialog).queryByLabelText(/one piece contains/i)).not.toBeInTheDocument()
  })

  it("supports piece selling units purchased by the carton", async () => {
    const user = userEvent.setup()
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={vi.fn()} />)
    const dialog = screen.getByRole("dialog")
    await user.selectOptions(within(dialog).getByLabelText(/i sell this product by/i), "piece")
    await user.selectOptions(within(dialog).getByLabelText(/i buy this product by/i), "carton")
    expect(within(dialog).getByLabelText(/one carton contains/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/cost per carton \(GHS\)/i)).toBeInTheDocument()
  })

  it("normalizes custom units selected through Other", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={onSubmit} />)
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText(/product name/i), "Custom goods")
    await user.selectOptions(within(dialog).getByLabelText(/i sell this product by/i), "other")
    await user.type(within(dialog).getAllByLabelText(/^unit name$/i)[0], "  Tray  ")
    await user.selectOptions(within(dialog).getByLabelText(/i buy this product by/i), "other")
    await user.type(within(dialog).getAllByLabelText(/^unit name$/i)[0], "  Bundle  ")
    await user.clear(within(dialog).getByRole("textbox", { name: /one/i }))
    await user.type(within(dialog).getByRole("textbox", { name: /one/i }), "4")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ baseUnit: "tray", purchaseUnit: "bundle", purchaseConversionQuantity: "4" }))
  })

  it("keeps an existing non-standard unit on the Other path while editing", () => {
    const product = { id: "p2", businessId: "b1", categoryId: null, categoryName: null, name: "Custom goods", sku: null, description: null, costPrice: "2", sellingPrice: "4", baseUnit: "Tray", purchaseUnit: "Bundle", purchaseConversionQuantity: "4", currentQuantity: "8", lowStockThreshold: "1", isActive: true } satisfies Product
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={vi.fn()} product={product} />)
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByLabelText(/i sell this product by/i)).toHaveValue("other")
    expect(within(dialog).getAllByLabelText(/^unit name$/i)[1]).toHaveValue("Tray")
    expect(within(dialog).getByLabelText(/i buy this product by/i)).toHaveValue("other")
    expect(within(dialog).getAllByLabelText(/^unit name$/i)[0]).toHaveValue("Bundle")
  })

  it("keeps legacy units neutral in financial presentation while preserving the stored value", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={onSubmit} />)
    const dialog = screen.getByRole("dialog")

    expect(within(dialog).getByLabelText(/i sell this product by/i)).toHaveValue("unit")
    expect(within(dialog).getAllByRole("option", { name: "Not specified" })).toHaveLength(2)
    expect(within(dialog).getByLabelText(/cost \(GHS\)/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/selling price \(GHS\)/i)).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/product name/i), "Generic goods")
    await user.clear(within(dialog).getByLabelText(/cost \(GHS\)/i))
    await user.type(within(dialog).getByLabelText(/cost \(GHS\)/i), "310")
    await user.clear(within(dialog).getByLabelText(/selling price \(GHS\)/i))
    await user.type(within(dialog).getByLabelText(/selling price \(GHS\)/i), "360")

    expect(dialog).toHaveTextContent(/Your cost: GHS 310(?:\.00)?/i)
    expect(dialog).toHaveTextContent(/Cost: GHS 310(?:\.00)?/i)
    expect(dialog).toHaveTextContent(/Profit: GHS 50(?:\.00)? · Margin:/i)
    expect(dialog).not.toHaveTextContent(/per not specified|\/ not specified|per unit|\/ unit/i)

    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ baseUnit: "unit", purchaseUnit: "unit", costPrice: "310", sellingPrice: "360" }))
  })

  it("makes zero-category creation discoverable and preserves the product form", async () => {
    const user = userEvent.setup()
    const onCreateCategory = vi.fn().mockResolvedValue({ id: "cat-new", name: "Accessories", description: null })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ProductFormDialog categories={[]} currency="USD" onClose={vi.fn()} onCreateCategory={onCreateCategory} onSubmit={onSubmit} />)
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText(/product name/i), "Phone case")
    expect(within(dialog).getByText(/no categories yet/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: /create category/i }))
    await user.type(within(dialog).getByLabelText(/new category name/i), "Accessories")
    await user.click(within(dialog).getByRole("button", { name: /^create$/i }))
    expect(onCreateCategory).toHaveBeenCalledWith({ name: "Accessories" })
    expect(within(dialog).getByRole("option", { name: "Accessories" })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/product name/i)).toHaveValue("Phone case")
  })
})
