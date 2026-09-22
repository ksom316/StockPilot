export const financeKeys = {
  all: (businessId: string) => ["finance", businessId] as const,
  categories: (businessId: string) => ["finance", businessId, "categories"] as const,
  expenses: (businessId: string) => ["finance", businessId, "expenses"] as const,
  audit: (businessId: string, expenseId: string) => ["finance", businessId, "expense-audit", expenseId] as const,
  summaries: (businessId: string) => ["finance", businessId, "summary"] as const,
  summary: (businessId: string, startDate: string, endDate: string) => ["finance", businessId, "summary", startDate, endDate] as const,
}
