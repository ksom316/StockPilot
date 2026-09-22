import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FinanceExpensesPage } from "@/pages/finance-expenses-page"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const mocks = vi.hoisted(() => ({
  expenses: [{ id: "e1", categoryId: "c1", categoryName: "Rent snapshot", amount: "12.3456", expenseDate: "2026-09-01", description: "Shop rent", notes: "Monthly", createdBy: "u1", createdAt: "2026-09-01T10:00:00Z", updatedBy: "u1", updatedAt: "2026-09-01T10:00:00Z", voided: false, voidReason: null, voidedBy: null, voidedAt: null }, { id: "e2", categoryId: "c1", categoryName: "Rent", amount: "0.0001", expenseDate: "2026-09-02", description: "Duplicate rent", notes: null, createdBy: "u1", createdAt: "2026-09-02T10:00:00Z", updatedBy: "u1", updatedAt: "2026-09-02T10:00:00Z", voided: true, voidReason: "Duplicate", voidedBy: "u1", voidedAt: "2026-09-03T10:00:00Z" }] as Array<Record<string, unknown>>,
  categories: [{ id: "c1", name: "Rent", isSystem: true, isActive: true }, { id: "c2", name: "Custom", isSystem: false, isActive: true }, { id: "c3", name: "Closed", isSystem: false, isActive: false }] as Array<{ id: string; name: string; isSystem: boolean; isActive: boolean }>,
  create: vi.fn(), update: vi.fn(), voidExpense: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), audit: [{ action: "created", actorLabel: "Team member", changedAt: "2026-09-01T10:00:00Z", beforeData: null, afterData: { description: "Shop rent" } }, { action: "updated", actorLabel: "Team member", changedAt: "2026-09-02T10:00:00Z", beforeData: { amount: "10" }, afterData: { amount: "12.3456" } }] as Array<Record<string, unknown>>,
}))
vi.mock("@/features/finance/finance-queries", () => ({
  useExpenses: () => ({ data: mocks.expenses, isLoading: false, isError: false, refetch: vi.fn() }),
  useExpenseCategories: () => ({ data: mocks.categories, isLoading: false, isError: false, refetch: vi.fn() }),
  useExpenseAudit: (id: string | null) => ({ data: id ? mocks.audit : undefined, isLoading: false, isError: false }),
  useExpenseMutations: () => ({ create: { mutateAsync: mocks.create, isPending: false }, update: { mutateAsync: mocks.update, isPending: false }, void: { mutateAsync: mocks.voidExpense, isPending: false }, createCategory: { mutateAsync: mocks.createCategory, isPending: false }, updateCategory: { mutateAsync: mocks.updateCategory, isPending: false } }),
}))
function renderPage(role: "owner" | "manager" = "owner") { return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules: ["expenses"] })}><MemoryRouter><FinanceExpensesPage /></MemoryRouter></TestBusinessProvider>) }

describe("Finance expense management", () => {
  beforeEach(() => { mocks.expenses = mocks.expenses.map((expense) => ({ ...expense })); mocks.create.mockReset().mockResolvedValue({}); mocks.update.mockReset().mockResolvedValue({}); mocks.voidExpense.mockReset().mockResolvedValue({}); mocks.createCategory.mockReset().mockResolvedValue(undefined); mocks.updateCategory.mockReset().mockResolvedValue(undefined) })
  afterEach(cleanup)
  it("renders active rows, saved category names, exact large-scale decimals, and voided status", () => {
    renderPage()
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "all" } })
    expect(screen.getByText("Rent snapshot")).toBeInTheDocument()
    expect(screen.getAllByText("US$12.3456").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Voided").length).toBeGreaterThan(0)
  })
  it("filters expenses and clears filters", async () => {
    const user = userEvent.setup(); renderPage()
    await user.selectOptions(screen.getByLabelText("Status"), "all")
    await user.type(screen.getByLabelText("Search description"), "duplicate")
    expect(screen.getAllByText("Duplicate rent").length).toBeGreaterThan(0)
    expect(screen.queryAllByText("Shop rent")).toHaveLength(0)
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(screen.getAllByText("Shop rent").length).toBeGreaterThan(0)
  })
  it("creates an expense with exact amount, only active categories, and trimmed fields", async () => {
    const user = userEvent.setup(); renderPage()
    await user.click(screen.getByRole("button", { name: "Add expense" }))
    expect(screen.getAllByLabelText(/Category/)[0].querySelector('option[value="c3"]')).toBeNull()
    fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: "12.3456" } })
    fireEvent.change(screen.getByLabelText("Description *"), { target: { value: "  Internet  " } })
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "  monthly  " } })
    await user.click(screen.getByRole("button", { name: "Create expense" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ amount: "12.3456", categoryId: "c1", description: "Internet", notes: "monthly" })))
  })
  it.each(["0", "-1", "1.00001"]) ("rejects invalid amount %s at form validation", async (amount) => {
    const user = userEvent.setup(); renderPage()
    await user.click(screen.getByRole("button", { name: "Add expense" }))
    fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: amount } })
    await user.click(screen.getByRole("button", { name: "Create expense" }))
    expect(screen.getByRole("alert")).toHaveTextContent(/amount greater than zero/i)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it("edits through the safe mutation and makes voiding require a reason", async () => {
    const user = userEvent.setup(); renderPage()
    await user.click(screen.getAllByRole("button", { name: "Edit Shop rent" })[0])
    fireEvent.change(screen.getByLabelText("Amount *"), { target: { value: "15.0001" } })
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", input: expect.objectContaining({ amount: "15.0001" }) })))
    await user.click(screen.getAllByRole("button", { name: "Void Shop rent" })[0])
    await user.click(screen.getByRole("button", { name: "Confirm void" }))
    expect(screen.getByRole("alert")).toHaveTextContent(/reason/i)
    fireEvent.change(screen.getByLabelText("Reason *"), { target: { value: "Duplicate entry" } })
    await user.click(screen.getByRole("button", { name: "Confirm void" }))
    await waitFor(() => expect(mocks.voidExpense).toHaveBeenCalledWith({ id: "e1", reason: "Duplicate entry" }))
  })
  it("shows readable audit events, safe actor fallback, and void reason without raw JSON", async () => {
    const user = userEvent.setup(); renderPage()
    await user.click(screen.getAllByRole("button", { name: "View details for Shop rent" })[0])
    expect(await screen.findByRole("heading", { name: "Expense details" })).toBeInTheDocument()
    expect(screen.getByText(/Updated ·/)).toBeInTheDocument()
    expect(screen.getByText(/Team member · Changed amount/)).toBeInTheDocument()
    expect(screen.queryByText(/\{"description"/)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Status"), "voided")
    await user.click(screen.getAllByRole("button", { name: "View details for Duplicate rent" })[0])
    expect(screen.getByText(/Voided · Duplicate/)).toBeInTheDocument()
  })
  it("supports custom category create, rename, and deactivate without delete controls", async () => {
    const user = userEvent.setup(); renderPage()
    await user.type(screen.getByLabelText("New category name"), "Freight")
    await user.click(screen.getByRole("button", { name: "Add category" }))
    expect(mocks.createCategory).toHaveBeenCalledWith("Freight")
    await user.click(screen.getAllByRole("button", { name: "Rename" })[0])
    fireEvent.change(screen.getByPlaceholderText("Category name"), { target: { value: "Travel" } })
    await user.click(screen.getByRole("button", { name: "Save category" }))
    expect(mocks.updateCategory).toHaveBeenCalledWith({ id: "c2", name: "Travel" })
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument()
  })
})
