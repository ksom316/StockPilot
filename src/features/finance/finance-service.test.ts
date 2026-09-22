import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), update: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn() }))
vi.mock("@/lib/supabase", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }))

import { createExpense, fetchExpenses, updateExpense, voidExpense } from "@/features/finance/finance-service"

describe("finance service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.from.mockReturnValue({ select: mock.select, update: mock.update, insert: mock.insert })
    mock.select.mockReturnValue({ eq: mock.eq, order: mock.order })
    mock.eq.mockReturnValue({ eq: mock.eq, order: mock.order, select: mock.select, maybeSingle: mock.maybeSingle })
    mock.order.mockReturnValue({ order: mock.order })
    mock.update.mockReturnValue({ eq: mock.eq })
  })
  it("loads expenses scoped by business and keeps numeric values as strings", async () => {
    mock.order.mockReturnValueOnce({ order: mock.order }).mockResolvedValueOnce({ data: [{ id: "e1", category_id: "c1", category_name: "Rent", amount_text: "999999999999999.9999", expense_date: "2026-09-01", description: "Rent", notes: null, created_by: "u1", created_at: "2026-09-01T10:00:00Z", updated_by: "u1", updated_at: "2026-09-01T10:00:00Z", voided: false, void_reason: null, voided_by: null, voided_at: null }], error: null })
    await expect(fetchExpenses("b1")).resolves.toMatchObject([{ amount: "999999999999999.9999", categoryName: "Rent" }])
    expect(mock.from).toHaveBeenCalledWith("expenses")
    expect(mock.eq).toHaveBeenCalledWith("business_id", "b1")
  })
  it("calls create and update RPCs with exact decimal strings and no caller actor", async () => {
    mock.rpc.mockResolvedValue({ data: { id: "e1", category_id: "c1", category_name: "Rent", amount: "12.3456", expense_date: "2026-09-01", description: "Rent", notes: null, created_by: "u1", created_at: "2026-09-01T10:00:00Z", updated_by: "u1", updated_at: "2026-09-01T10:00:00Z", voided: false, void_reason: null, voided_by: null, voided_at: null }, error: null })
    const input = { categoryId: "c1", amount: "12.3456", expenseDate: "2026-09-01", description: " Rent ", notes: null }
    await createExpense("b1", input)
    expect(mock.rpc).toHaveBeenNthCalledWith(1, "create_expense", expect.objectContaining({ p_business_id: "b1", p_category_id: "c1", p_amount: "12.3456", p_description: "Rent" }))
    await updateExpense("e1", input)
    expect(mock.rpc).toHaveBeenNthCalledWith(2, "update_expense", expect.objectContaining({ p_expense_id: "e1", p_amount: "12.3456" }))
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain("actor")
  })
  it("voids by RPC with a reason and rejects invalid exact amounts before calling Supabase", async () => {
    mock.rpc.mockResolvedValue({ data: {}, error: null })
    await voidExpense("e1", "Duplicate")
    expect(mock.rpc).toHaveBeenCalledWith("void_expense", { p_expense_id: "e1", p_reason: "Duplicate" })
    await expect(createExpense("b1", { categoryId: "c1", amount: "-2", expenseDate: "2026-09-01", description: "No", notes: null })).rejects.toThrow(/greater than zero/i)
    expect(mock.rpc).toHaveBeenCalledTimes(1)
  })
})
