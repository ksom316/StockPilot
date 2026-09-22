import { describe, expect, it } from "vitest"
import { filterExpenses } from "@/features/finance/finance-filters"
import type { Expense } from "@/features/finance/finance-types"

const rows: Expense[] = [
  { id: "1", categoryId: "c1", categoryName: "Rent snapshot", amount: "12.3456", expenseDate: "2026-09-01", description: "Shop rent", notes: null, createdBy: "u1", createdAt: "2026-09-01T10:00:00Z", updatedBy: "u1", updatedAt: "2026-09-01T10:00:00Z", voided: false, voidReason: null, voidedBy: null, voidedAt: null },
  { id: "2", categoryId: "c2", categoryName: "Internet", amount: "0.0001", expenseDate: "2026-09-05", description: "Internet bill", notes: null, createdBy: "u1", createdAt: "2026-09-05T10:00:00Z", updatedBy: "u1", updatedAt: "2026-09-05T10:00:00Z", voided: true, voidReason: "Duplicate", voidedBy: "u1", voidedAt: "2026-09-06T10:00:00Z" },
]
const defaults = { term: "", categoryId: "", status: "all" as const, startDate: "", endDate: "" }
describe("expense filters", () => {
  it("filters search, category, status, and inclusive date ranges", () => {
    expect(filterExpenses(rows, { ...defaults, term: "rent", categoryId: "c1", status: "active", startDate: "2026-09-01", endDate: "2026-09-01" }).map((row) => row.id)).toEqual(["1"])
    expect(filterExpenses(rows, { ...defaults, status: "voided" }).map((row) => row.id)).toEqual(["2"])
  })
  it("safely ignores malformed dates and treats reversed ranges as cleared", () => {
    expect(filterExpenses(rows, { ...defaults, startDate: "bad", endDate: "2026-09-01" })).toHaveLength(1)
    expect(filterExpenses(rows, { ...defaults, startDate: "2026-09-10", endDate: "2026-09-01" })).toHaveLength(2)
  })
})
