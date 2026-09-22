import { describe, expect, it } from "vitest"
import { formatExpenseMoney, isValidIsoDate, parseExpenseAmount } from "@/features/finance/finance-money"

describe("expense decimal handling", () => {
  it.each(["12", "12.5", "12.50", "12.3456", "0.0001"]) ("accepts %s exactly", (value) => {
    expect(parseExpenseAmount(value)).not.toBeNull()
  })
  it.each(["0", "-1", "1.00001", "999999999999999.99999", "1e2", "12.", ".2"]) ("rejects invalid amount %s", (value) => {
    expect(parseExpenseAmount(value)).toBeNull()
  })
  it("preserves amount as a decimal string and formats large values without Number", () => {
    expect(parseExpenseAmount("999999999999999.9999")?.value).toBe("999999999999999.9999")
    expect(formatExpenseMoney("123456789012345.6789", "USD")).toContain("123,456,789,012,345.6789")
  })
  it("validates ISO calendar dates", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true)
    expect(isValidIsoDate("2026-02-30")).toBe(false)
    expect(isValidIsoDate("not-a-date")).toBe(false)
  })
})
