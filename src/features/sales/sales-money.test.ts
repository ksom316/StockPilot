import { describe, expect, it } from "vitest"

import { calculateSaleLineTotal, calculateSaleTotal, parseSalePrice } from "@/features/sales/sales-money"

describe("sale decimal arithmetic", () => {
  it("validates sale prices to four decimal places", () => {
    expect(parseSalePrice("0")).toEqual({ value: "0", scaled: 0n })
    expect(parseSalePrice("12.3400")?.value).toBe("12.34")
    expect(parseSalePrice("1.00001")).toBeNull()
    expect(parseSalePrice("-1")).toBeNull()
  })

  it("calculates and sums transaction totals without binary float errors", () => {
    expect(calculateSaleLineTotal("0.333", "0.1")).toBe("0.0333")
    expect(calculateSaleLineTotal("0.333", "19.9999")).toBe("6.66")
    expect(calculateSaleLineTotal("1", "999999999999999.9999")).toBe("999999999999999.9999")
    expect(calculateSaleTotal([
      { quantity: "3", unitPrice: "0.1" },
      { quantity: "1", unitPrice: "0.2" },
    ])).toBe("0.5")
    expect(calculateSaleLineTotal("10", "999999999999999.9999")).toBeNull()
    expect(calculateSaleTotal([
      { quantity: "1", unitPrice: "999999999999999.9999" },
      { quantity: "1", unitPrice: "0.0001" },
    ])).toBeNull()
  })
})
