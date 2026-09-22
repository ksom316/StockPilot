import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { InventoryDataError } from "@/features/inventory/inventory-service"
import { StockOperationDialog } from "@/features/inventory/stock-operation-dialog"
import type { Product } from "@/features/inventory/inventory-types"

const product = { id: "p1", businessId: "b1", categoryId: null, categoryName: null, name: "Cable", sku: "C1", description: null, costPrice: "1", sellingPrice: "2", currentQuantity: "10", lowStockThreshold: "2", isActive: true } satisfies Product

describe("StockOperationDialog", () => {
  it("shows friendly insufficient-stock feedback and preserves the form", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new InventoryDataError("There isn't enough stock for this operation. Refresh the catalog and try again.", "INSUFFICIENT_STOCK"))
    render(<StockOperationDialog onClose={vi.fn()} onSubmit={onSubmit} product={product} />)
    await user.selectOptions(screen.getByLabelText(/operation/i), "stock_out")
    await user.type(screen.getByLabelText(/^quantity$/i), "3")
    await user.click(screen.getByRole("button", { name: /record operation/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't enough stock/i)
    expect(screen.getByLabelText(/^quantity$/i)).toHaveValue("3")
  })

  it("prevents rapid double submission", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn(() => new Promise<void>(() => undefined))
    render(<StockOperationDialog onClose={vi.fn()} onSubmit={onSubmit} product={product} />)
    await user.type(screen.getByLabelText(/^quantity$/i), "1")
    await user.dblClick(screen.getByRole("button", { name: /record operation/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: /recording/i })).toBeDisabled()
  })
})
