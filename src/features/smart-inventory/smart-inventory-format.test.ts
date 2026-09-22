import { describe, expect, it } from "vitest"

import { formatEstimatedDays, formatSmartDateRange, formatSmartQuantity } from "@/features/smart-inventory/smart-inventory-format"

describe("Smart Inventory exact display formatting", () => {
  it("formats decimal strings without converting them to floating point", () => {
    expect(formatSmartQuantity("999999999999999.999")).toBe("999999999999999.999")
    expect(formatSmartQuantity("4.000")).toBe("4")
    expect(formatSmartQuantity(null)).toBe("Unavailable")
  })

  it("rounds only the presentation of an eligible estimate and preserves the 365+ rule", () => {
    expect(formatEstimatedDays("9.876543210987654321")).toBe("9.9 days")
    expect(formatEstimatedDays("365.000")).toBe("365.0 days")
    expect(formatEstimatedDays("365.0001")).toBe("365+ days")
    expect(formatEstimatedDays("999999999999999.999")).toBe("365+ days")
    expect(formatEstimatedDays(null)).toBe("Unavailable")
  })

  it("keeps the backend business-local date wording visible", () => {
    expect(formatSmartDateRange("2026-08-23", "2026-09-22")).toBe("2026-08-23 through 2026-09-22 (end date excluded)")
  })
})

