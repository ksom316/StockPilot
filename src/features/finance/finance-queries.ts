import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useBusiness } from "@/features/business/business-context"
import { createExpense, createExpenseCategory, fetchExpenseAudit, fetchExpenseCategories, fetchExpenses, updateExpense, updateExpenseCategory, voidExpense } from "@/features/finance/finance-service"
import { FinanceDataError, type ExpenseInput } from "@/features/finance/finance-types"

export const financeKeys = {
  all: (businessId: string) => ["finance", businessId] as const,
  categories: (businessId: string) => ["finance", businessId, "categories"] as const,
  expenses: (businessId: string) => ["finance", businessId, "expenses"] as const,
  audit: (businessId: string, expenseId: string) => ["finance", businessId, "expense-audit", expenseId] as const,
}

export function useExpenseCategories() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({ queryKey: financeKeys.categories(businessId), queryFn: () => fetchExpenseCategories(businessId), enabled: Boolean(businessId) })
}

export function useExpenses() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({ queryKey: financeKeys.expenses(businessId), queryFn: () => fetchExpenses(businessId), enabled: Boolean(businessId) })
}

export function useExpenseAudit(expenseId: string | null) {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({ queryKey: financeKeys.audit(businessId, expenseId ?? ""), queryFn: () => fetchExpenseAudit(businessId, expenseId ?? ""), enabled: Boolean(businessId && expenseId) })
}

export function useExpenseMutations() {
  const { business } = useBusiness()
  const client = useQueryClient()
  const invalidate = async (expenseId?: string) => {
    if (!business) return
    await Promise.all([
      client.invalidateQueries({ queryKey: financeKeys.expenses(business.id) }),
      ...(expenseId ? [client.invalidateQueries({ queryKey: financeKeys.audit(business.id, expenseId) })] : []),
    ])
  }
  const needBusiness = () => { if (!business) throw new FinanceDataError("Your workspace is unavailable.") ; return business.id }
  return {
    create: useMutation({ mutationFn: (input: ExpenseInput) => createExpense(needBusiness(), input), onSuccess: () => invalidate() }),
    update: useMutation({ mutationFn: ({ id, input }: { id: string; input: ExpenseInput }) => { needBusiness(); return updateExpense(id, input) }, onSuccess: (_, variables) => invalidate(variables.id) }),
    void: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => { needBusiness(); return voidExpense(id, reason) }, onSuccess: (_, variables) => invalidate(variables.id) }),
    createCategory: useMutation({ mutationFn: (name: string) => createExpenseCategory(needBusiness(), name), onSuccess: () => business ? client.invalidateQueries({ queryKey: financeKeys.categories(business.id) }) : undefined }),
    updateCategory: useMutation({ mutationFn: ({ id, name, isActive }: { id: string; name?: string; isActive?: boolean }) => updateExpenseCategory(needBusiness(), id, { name, isActive }), onSuccess: () => business ? Promise.all([client.invalidateQueries({ queryKey: financeKeys.categories(business.id) }), client.invalidateQueries({ queryKey: financeKeys.expenses(business.id) })]) : undefined }),
  }
}
