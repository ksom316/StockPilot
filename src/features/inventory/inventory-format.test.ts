import { describe, expect, it } from "vitest"

import { formatMoney, getStockState } from "@/features/inventory/inventory-format"

describe("getStockState", () => {
  it.each([
    ["0", "5", "Out of stock"],
    ["0.000", "0", "Out of stock"],
    ["2.500", "3", "Low stock"],
    ["3", "3.000", "Low stock"],
    ["3.001", "3", "In stock"],
    ["100000000000000.001", "99999999999999.999", "In stock"],
  ])("maps quantity %s and threshold %s to %s", (quantity, threshold, expected) => {
    expect(getStockState(quantity, threshold)).toBe(expected)
  })
})

describe("formatMoney", () => {
  it("preserves database precision for values beyond JavaScript's safe integer range", () => {
    expect(formatMoney("999999999999999.1234", "USD")).toContain("999,999,999,999,999.1234")
  })
})
