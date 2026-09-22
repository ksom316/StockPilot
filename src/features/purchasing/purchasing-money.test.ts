import { describe, expect, it } from "vitest"

import { calculatePurchaseLineTotal, calculatePurchaseTotal, maximumPurchaseAmountScaled, maximumPurchaseQuantityScaled, parseUnitCost } from "@/features/purchasing/purchasing-money"

describe("purchasing exact decimals", () => {
  it("parses zero and precise unit costs without floating point", () => {
    expect(parseUnitCost("0")?.value).toBe("0")
    expect(parseUnitCost("12.5000")?.value).toBe("12.5")
    expect(parseUnitCost("1.00001")).toBeNull()
  })

  it("calculates rounded line and receipt totals using scaled integers", () => {
    expect(calculatePurchaseLineTotal("2.125", "50.1234")).toBe("106.5122")
    expect(calculatePurchaseTotal([
      { quantity: "2.125", unitCost: "50.1234" },
      { quantity: "1.500", unitCost: "4.25" },
    ])).toBe("112.8872")
  })

  it("respects numeric(18,3) quantity and numeric(19,4) amount bounds", () => {
    expect(calculatePurchaseLineTotal("999999999999999.999", "1")).toBe("999999999999999.999")
    expect(calculatePurchaseLineTotal("999999999999999.999", "10")).toBeNull()
    expect(maximumPurchaseAmountScaled).toBe(10n ** 19n - 1n)
    expect(maximumPurchaseQuantityScaled).toBe(10n ** 18n - 1n)
  })
})
