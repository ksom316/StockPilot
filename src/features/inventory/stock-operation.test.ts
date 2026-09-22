import { describe, expect, it } from "vitest"

import { buildStockMovement, type StockOperation } from "@/features/inventory/stock-operation"

function build(operation: StockOperation, enteredQuantity: string, reason = operation === "stock_in" || operation === "stock_out" ? "" : "Cycle count") {
  return buildStockMovement({ productId: "product-1", currentQuantity: "10", operation, enteredQuantity, reason, otherDirection: "decrease" })
}

describe("buildStockMovement", () => {
  it.each([
    ["stock_in", "2.5", "stock_in", "2.5", "12.5"],
    ["stock_out", "3", "stock_out", "3", "7"],
    ["damaged", "1", "damaged", "1", "9"],
    ["lost", "0.5", "lost", "0.5", "9.5"],
  ] as const)("maps %s to the secured RPC semantics", (operation, entered, movementType, quantity, resulting) => {
    const result = build(operation, entered)
    expect(result).toMatchObject({ movement: { productId: "product-1", movementType, quantity }, resultingQuantity: resulting })
  })

  it("requires a reason and maps Other decrease to a signed adjustment", () => {
    expect(build("other", "2", "")).toEqual({ error: "Add a reason for this stock operation." })
    expect(build("other", "2")).toMatchObject({ movement: { movementType: "adjustment", quantity: "-2", reason: "Cycle count" }, resultingQuantity: "8" })
  })

  it.each([
    ["8", "-2", "8"],
    ["13", "3", "13"],
  ])("turns a correction to %s into signed delta %s", (physicalCount, delta, resulting) => {
    expect(build("correction", physicalCount)).toMatchObject({ movement: { movementType: "adjustment", quantity: delta }, resultingQuantity: resulting })
  })

  it("does not create a no-op correction", () => {
    expect(build("correction", "10")).toEqual({ error: "The physical count already matches the recorded quantity. No change is required." })
  })

  it.each(["-1", "abc", "1.2345", "1000000000000000"])("rejects invalid quantity %s", (quantity) => {
    expect(build("stock_in", quantity)).toHaveProperty("error")
  })

  it("rejects zero for magnitude operations and negative results", () => {
    expect(build("stock_in", "0")).toEqual({ error: "Quantity must be greater than zero." })
    expect(build("stock_out", "10.001")).toEqual({ error: "This operation would make stock negative. Enter a smaller quantity." })
  })
})
