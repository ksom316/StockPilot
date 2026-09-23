import { describe, expect, it } from "vitest"
import { getReportDateRange } from "./report-period"

describe("report periods", () => {
  const now = new Date("2026-09-23T12:00:00Z")
  it("uses business-local dates and supports presets", () => {
    expect(getReportDateRange("yesterday", "UTC", now)).toEqual({ startDate: "2026-09-22", endDate: "2026-09-22" })
    expect(getReportDateRange("last_month", "UTC", now)).toEqual({ startDate: "2026-08-01", endDate: "2026-08-31" })
    expect(getReportDateRange("this_week", "UTC", now)).toEqual({ startDate: "2026-09-21", endDate: "2026-09-23" })
  })
  it("rejects unordered, future, and oversized custom ranges", () => {
    expect(getReportDateRange("custom", "UTC", now, "2026-09-24", "2026-09-23")).toBeNull()
    expect(getReportDateRange("custom", "UTC", now, "2026-09-01", "2026-09-24")).toBeNull()
    expect(getReportDateRange("custom", "UTC", now, "2025-01-01", "2026-09-23")).toBeNull()
  })
})
