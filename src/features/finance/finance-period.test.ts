import { describe, expect, it } from "vitest"
import { getFinanceDateRange } from "@/features/finance/finance-period"

describe("finance period ranges", () => {
  const now = new Date("2026-09-22T12:00:00.000Z")

  it("uses business calendar dates for Today", () => {
    expect(getFinanceDateRange("today", "UTC", now)).toEqual({ startDate: "2026-09-22", endDate: "2026-09-22" })
    expect(getFinanceDateRange("today", "America/Los_Angeles", new Date("2026-09-22T01:00:00.000Z"))).toEqual({ startDate: "2026-09-21", endDate: "2026-09-21" })
  })

  it("fails safely for an invalid business timezone", () => {
    expect(getFinanceDateRange("today", "not/a-timezone", now)).toBeNull()
    expect(getFinanceDateRange("month", "not/a-timezone", now)).toBeNull()
  })

  it("accepts custom ranges up to 366 inclusive calendar days and rejects larger or reversed ranges", () => {
    expect(getFinanceDateRange("custom", "UTC", now, "2025-01-01", "2026-01-01")).toEqual({ startDate: "2025-01-01", endDate: "2026-01-01" })
    expect(getFinanceDateRange("custom", "UTC", now, "2025-01-01", "2026-01-02")).toBeNull()
    expect(getFinanceDateRange("custom", "UTC", now, "2026-01-02", "2026-01-01")).toBeNull()
  })

  it("uses Monday through Sunday for This Week", () => {
    expect(getFinanceDateRange("week", "UTC", now)).toEqual({ startDate: "2026-09-21", endDate: "2026-09-27" })
  })

  it("defaults This Month to the complete current month", () => {
    expect(getFinanceDateRange("month", "UTC", now)).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" })
  })

  it("accepts valid custom ranges and rejects invalid or reversed ranges", () => {
    expect(getFinanceDateRange("custom", "UTC", now, "2026-09-02", "2026-09-09")).toEqual({ startDate: "2026-09-02", endDate: "2026-09-09" })
    expect(getFinanceDateRange("custom", "UTC", now, "2026-02-30", "2026-03-01")).toBeNull()
    expect(getFinanceDateRange("custom", "UTC", now, "2026-09-10", "2026-09-09")).toBeNull()
  })
})
