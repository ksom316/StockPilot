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
    await user.clear(within(dialog).getByLabelText(/cost price/i))
    await user.type(within(dialog).getByLabelText(/cost price/i), "1.12345")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(within(dialog).getByText("Enter a product name.")).toBeInTheDocument()
    expect(within(dialog).getByText("Enter a SKU.")).toBeInTheDocument()
    expect(within(dialog).getByText(/up to 4 decimal places/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("shows a useful duplicate SKU error", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new InventoryDataError("duplicate", "23505"))
    render(<ProductFormDialog categories={[]} currency="USD" onClose={vi.fn()} onSubmit={onSubmit} />)
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByLabelText(/product name/i), "USB Cable")
    await user.type(within(dialog).getByLabelText(/^sku$/i), "USB-1")
    await user.click(within(dialog).getByRole("button", { name: /add product/i }))
    expect(await within(dialog).findByText(/sku is already used/i)).toBeInTheDocument()
  })

  it("keeps current quantity read-only while editing", () => {
    const product = { id: "p1", businessId: "b1", categoryId: null, categoryName: null, name: "Cable", sku: "C1", description: null, costPrice: "1", sellingPrice: "2", currentQuantity: "7.500", lowStockThreshold: "2", isActive: true } satisfies Product
    render(<ProductFormDialog categories={[]} currency="USD" onClose={vi.fn()} onSubmit={vi.fn()} product={product} />)
    expect(screen.getByText(/current quantity:/i)).toHaveTextContent("7.5")
    expect(screen.queryByRole("textbox", { name: /current quantity/i })).not.toBeInTheDocument()
  })
})
