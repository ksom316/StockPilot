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
    await user.clear(within(dialog).getByLabelText(/cost per unit/i))
    await user.type(within(dialog).getByLabelText(/cost per unit/i), "1.12345")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(within(dialog).getByText("Enter a product name.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/sku \(optional\)/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/enter what one unit costs/i)).toBeInTheDocument()
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
    await user.clear(within(dialog).getByLabelText(/^selling unit$/i))
    await user.type(within(dialog).getByLabelText(/^selling unit$/i), "kg")
    await user.clear(within(dialog).getByLabelText(/^purchase unit$/i))
    await user.type(within(dialog).getByLabelText(/^purchase unit$/i), "carton")
    await user.clear(within(dialog).getByLabelText(/cost per carton/i))
    await user.type(within(dialog).getByLabelText(/cost per carton/i), "300")
    await user.clear(within(dialog).getByLabelText(/selling price per unit/i))
    await user.type(within(dialog).getByLabelText(/selling price per unit/i), "40")
    await user.clear(within(dialog).getByLabelText(/how many kg are in one carton/i))
    await user.type(within(dialog).getByLabelText(/how many kg are in one carton/i), "0")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(within(dialog).getByLabelText(/how many kg are in one carton/i)).toHaveAttribute("aria-invalid", "true")

    await user.clear(within(dialog).getByLabelText(/how many kg are in one carton/i))
    await user.type(within(dialog).getByLabelText(/how many kg are in one carton/i), "10")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ baseUnit: "kg", purchaseUnit: "carton", purchaseConversionQuantity: "10", costPrice: "30" }))
    expect(within(dialog).getByText(/GHS 30(?:\.00)? per kg/i)).toBeInTheDocument()
  })

  it("shows independent bulk pricing and a below-cost warning", async () => {
    const user = userEvent.setup()
    render(<ProductFormDialog categories={[]} currency="GHS" onClose={vi.fn()} onSubmit={vi.fn()} />)
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText(/product name/i), "Chicken Wings")
    await user.clear(within(dialog).getByLabelText(/cost per unit/i))
    await user.type(within(dialog).getByLabelText(/cost per unit/i), "30")
    await user.clear(within(dialog).getByLabelText(/^selling unit$/i))
    await user.type(within(dialog).getByLabelText(/^selling unit$/i), "kg")
    await user.clear(within(dialog).getByLabelText(/selling price per unit/i))
    await user.type(within(dialog).getByLabelText(/selling price per unit/i), "28")
    expect(within(dialog).getByText(/below your cost of GHS 30/i)).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText(/^purchase unit$/i))
    await user.type(within(dialog).getByLabelText(/^purchase unit$/i), "carton")
    await user.clear(within(dialog).getByLabelText(/how many kg are in one carton/i))
    await user.type(within(dialog).getByLabelText(/how many kg are in one carton/i), "10")
    await user.click(within(dialog).getByRole("button", { name: /add selling unit/i }))
    await user.type(within(dialog).getAllByLabelText(/selling unit$/i).at(-1)!, "carton")
    await user.clear(within(dialog).getAllByLabelText(/1 carton contains/i).at(-1)!)
    await user.type(within(dialog).getAllByLabelText(/1 carton contains/i).at(-1)!, "10")
    await user.clear(within(dialog).getByLabelText(/selling price \(GHS\)/i))
    await user.type(within(dialog).getByLabelText(/selling price \(GHS\)/i), "370")
    expect(within(dialog).getAllByText(/1 carton contains 10 kg/i).length).toBeGreaterThan(0)
  })

  it("keeps current quantity read-only while editing", () => {
    const product = { id: "p1", businessId: "b1", categoryId: null, categoryName: null, name: "Cable", sku: "C1", description: null, costPrice: "1", sellingPrice: "2", baseUnit: "piece", purchaseUnit: "carton", purchaseConversionQuantity: "12", currentQuantity: "7.500", lowStockThreshold: "2", isActive: true } satisfies Product
    render(<ProductFormDialog categories={[]} currency="USD" onClose={vi.fn()} onSubmit={vi.fn()} product={product} />)
    expect(screen.getByText(/current quantity:/i)).toHaveTextContent("7.5")
    expect(screen.queryByRole("textbox", { name: /current quantity/i })).not.toBeInTheDocument()
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
