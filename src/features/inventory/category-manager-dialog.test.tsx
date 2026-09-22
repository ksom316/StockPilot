import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CategoryManagerDialog } from "@/features/inventory/category-manager-dialog"
import { InventoryDataError } from "@/features/inventory/inventory-service"

describe("CategoryManagerDialog", () => {
  it("creates a category", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CategoryManagerDialog categories={[]} onClose={vi.fn()} onCreate={onCreate} onUpdate={vi.fn()} />)
    await user.type(screen.getByLabelText(/category name/i), "Electronics")
    await user.click(screen.getByRole("button", { name: /^add$/i }))
    expect(onCreate).toHaveBeenCalledWith({ name: "Electronics" })
  })

  it("handles case-insensitive duplicate category errors", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockRejectedValue(new InventoryDataError("duplicate", "23505"))
    render(<CategoryManagerDialog categories={[]} onClose={vi.fn()} onCreate={onCreate} onUpdate={vi.fn()} />)
    await user.type(screen.getByLabelText(/category name/i), "electronics")
    await user.click(screen.getByRole("button", { name: /^add$/i }))
    expect(await screen.findByText(/category with this name already exists/i)).toBeInTheDocument()
  })
})
