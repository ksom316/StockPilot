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
    expect(calculateSaleTotal([
      { quantity: "3", unitPrice: "0.1" },
      { quantity: "1", unitPrice: "0.2" },
    ])).toBe("0.5")
  })
})
