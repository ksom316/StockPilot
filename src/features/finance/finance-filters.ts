import { isValidIsoDate } from "@/features/finance/finance-money"
import type { Expense } from "@/features/finance/finance-types"

export type ExpenseStatus = "active" | "voided" | "all"

export function filterExpenses(expenses: Expense[], filters: { term: string; categoryId: string; status: ExpenseStatus; startDate: string; endDate: string }) {
  const start = isValidIsoDate(filters.startDate) ? filters.startDate : ""
  const end = isValidIsoDate(filters.endDate) ? filters.endDate : ""
  const validRange = !start || !end || start <= end
  const term = filters.term.trim().toLocaleLowerCase()
  return expenses.filter((expense) =>
    (filters.status === "all" || (filters.status === "voided" ? expense.voided : !expense.voided))
    && (!filters.categoryId || expense.categoryId === filters.categoryId)
    && (!term || expense.description.toLocaleLowerCase().includes(term))
    && (validRange ? (!start || expense.expenseDate >= start) && (!end || expense.expenseDate <= end) : true),
  )
}
