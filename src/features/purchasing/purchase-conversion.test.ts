import { describe, expect, it } from "vitest"

import { calculateBaseUnitCost, convertPurchaseQuantity } from "@/features/purchasing/purchase-conversion"

describe("purchase unit conversion", () => {
  it.each([
    ["3", "10", "30", "carton to kg"],
    ["2", "10", "20", "carton to piece"],
    ["2", "20", "40", "carton to pack"],
    ["1.25", "10", "12.5", "decimal purchase quantity"],
    ["3", "1", "3", "same-unit product"],
  ])("converts %s × %s to %s for %s", (quantity, conversion, expected) => {
    expect(convertPurchaseQuantity(quantity, conversion)).toBe(expected)
  })

  it("derives exact base-unit cost without floating point", () => {
    expect(calculateBaseUnitCost("300", "10")).toBe("30")
    expect(calculateBaseUnitCost("100", "3")).toBe("33.3333")
  })

  it.each(["0", "-1", "invalid"])("rejects invalid conversion quantity %s", (conversion) => {
    expect(convertPurchaseQuantity("2", conversion)).toBeNull()
    expect(calculateBaseUnitCost("300", conversion)).toBeNull()
  })

  it("rejects converted stock that cannot fit the database quantity scale", () => {
    expect(convertPurchaseQuantity("0.333", "1.5")).toBeNull()
  })
})
