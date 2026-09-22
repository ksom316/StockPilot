import { supabase } from "@/lib/supabase"
import { parseExpenseAmount } from "@/features/finance/finance-money"
import { FinanceDataError, type Expense, type ExpenseAuditEvent, type ExpenseCategory, type ExpenseInput, type FinancialSummary } from "@/features/finance/finance-types"

function requireClient() {
  if (!supabase) throw new FinanceDataError("Finance is unavailable. Refresh and try again.")
  return supabase
}

const expenseSelect = "id,category_id,category_name,amount_text:amount::text,expense_date,description,notes,created_by,created_at,updated_by,updated_at,voided,void_reason,voided_by,voided_at"

function mapExpense(row: Record<string, unknown>): Expense {
  return {
    id: String(row.id), categoryId: String(row.category_id), categoryName: String(row.category_name), amount: String(row.amount_text ?? row.amount),
    expenseDate: String(row.expense_date), description: String(row.description), notes: row.notes == null ? null : String(row.notes),
    createdBy: String(row.created_by), createdAt: String(row.created_at), updatedBy: String(row.updated_by), updatedAt: String(row.updated_at),
    voided: Boolean(row.voided), voidReason: row.void_reason == null ? null : String(row.void_reason),
    voidedBy: row.voided_by == null ? null : String(row.voided_by), voidedAt: row.voided_at == null ? null : String(row.voided_at),
  }
}

function throwFinanceError(error: { code?: string; message?: string }, fallback: string): never {
  if (error.code === "42501") throw new FinanceDataError("Finance is unavailable for this workspace or your role.", "ACCESS_DENIED")
  if (error.code === "22023") throw new FinanceDataError(error.message ?? "Check the expense details and try again.", "INVALID_EXPENSE")
  throw new FinanceDataError(fallback, error.code)
}

export async function fetchExpenseCategories(businessId: string): Promise<ExpenseCategory[]> {
  const { data, error } = await requireClient().from("expense_categories").select("id,name,is_system,is_active").eq("business_id", businessId).order("name")
  if (error) throwFinanceError(error, "We couldn't load expense categories.")
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, isSystem: row.is_system, isActive: row.is_active }))
}

export async function fetchExpenses(businessId: string): Promise<Expense[]> {
  const { data, error } = await requireClient().from("expenses").select(expenseSelect).eq("business_id", businessId).order("expense_date", { ascending: false }).order("created_at", { ascending: false })
  if (error) throwFinanceError(error, "We couldn't load expenses.")
  return (data ?? []).map((row) => mapExpense(row as unknown as Record<string, unknown>))
}

export async function fetchExpenseAudit(businessId: string, expenseId: string): Promise<ExpenseAuditEvent[]> {
  const { data, error } = await requireClient().from("expense_audit").select("action,actor_user_id,changed_at,before_data,after_data").eq("business_id", businessId).eq("expense_id", expenseId).order("changed_at", { ascending: true })
  if (error) throwFinanceError(error, "We couldn't load expense history.")
  return (data ?? []).map((row) => ({ action: row.action, actorLabel: "Team member", changedAt: row.changed_at, beforeData: row.before_data as Record<string, unknown> | null, afterData: row.after_data as Record<string, unknown> | null }))
}

export async function fetchFinancialSummary(businessId: string, startDate: string, endDate: string): Promise<FinancialSummary> {
  const { data, error } = await requireClient().rpc("get_financial_summary", { p_business_id: businessId, p_start_date: startDate, p_end_date: endDate }).select(
    "recorded_sales_text:recorded_sales::text,sale_count,sale_item_count,costed_sale_item_count,missing_cost_sale_item_count,cost_coverage_complete,estimated_product_cost_text:estimated_product_cost::text,estimated_gross_profit_text:estimated_gross_profit::text,estimated_gross_margin_text:estimated_gross_margin::text,operating_expenses_text:operating_expenses::text,estimated_net_profit_text:estimated_net_profit::text,estimated_net_margin_text:estimated_net_margin::text,purchase_receipts_text:purchase_receipts::text",
  )
  if (error) throwFinanceError(error, "We couldn't load the financial summary.")
  const rows = data as unknown as Record<string, unknown>[] | null
  const row = rows?.[0]
  if (!row) throw new FinanceDataError("The financial summary was unavailable. Try again.", "INVALID_SUMMARY")
  const nullableString = (value: unknown) => value == null ? null : String(value)
  return {
    recordedSales: String(row.recorded_sales_text),
    saleCount: Number(row.sale_count),
    saleItemCount: Number(row.sale_item_count),
    costedSaleItemCount: Number(row.costed_sale_item_count),
    missingCostSaleItemCount: Number(row.missing_cost_sale_item_count),
    costCoverageComplete: Boolean(row.cost_coverage_complete),
    estimatedProductCost: nullableString(row.estimated_product_cost_text),
    estimatedGrossProfit: nullableString(row.estimated_gross_profit_text),
    estimatedGrossMargin: nullableString(row.estimated_gross_margin_text),
    operatingExpenses: String(row.operating_expenses_text),
    estimatedNetProfit: nullableString(row.estimated_net_profit_text),
    estimatedNetMargin: nullableString(row.estimated_net_margin_text),
    purchaseReceipts: nullableString(row.purchase_receipts_text),
  }
}

export async function createExpense(businessId: string, input: ExpenseInput) {
  const amount = parseExpenseAmount(input.amount)
  if (!amount) throw new FinanceDataError("Enter an amount greater than zero with no more than four decimal places.", "INVALID_AMOUNT")
  const { data, error } = await requireClient().rpc("create_expense", { p_business_id: businessId, p_category_id: input.categoryId, p_amount: amount.value, p_expense_date: input.expenseDate, p_description: input.description.trim(), p_notes: input.notes?.trim() || null })
  if (error) throwFinanceError(error, "We couldn't create this expense.")
  return mapExpense(data as unknown as Record<string, unknown>)
}

export async function updateExpense(expenseId: string, input: ExpenseInput) {
  const amount = parseExpenseAmount(input.amount)
  if (!amount) throw new FinanceDataError("Enter an amount greater than zero with no more than four decimal places.", "INVALID_AMOUNT")
  const { data, error } = await requireClient().rpc("update_expense", { p_expense_id: expenseId, p_category_id: input.categoryId, p_amount: amount.value, p_expense_date: input.expenseDate, p_description: input.description.trim(), p_notes: input.notes?.trim() || null })
  if (error) throwFinanceError(error, "We couldn't update this expense.")
  if (!data) throw new FinanceDataError("This expense is unavailable.", "EXPENSE_UNAVAILABLE")
  return mapExpense(data as unknown as Record<string, unknown>)
}

export async function voidExpense(expenseId: string, reason: string) {
  const { data, error } = await requireClient().rpc("void_expense", { p_expense_id: expenseId, p_reason: reason.trim() })
  if (error) throwFinanceError(error, "We couldn't void this expense.")
  if (!data) throw new FinanceDataError("This expense is unavailable.", "EXPENSE_UNAVAILABLE")
  return mapExpense(data as unknown as Record<string, unknown>)
}

export async function createExpenseCategory(businessId: string, name: string) {
  const { error } = await requireClient().from("expense_categories").insert({ business_id: businessId, name: name.trim() })
  if (error) throwFinanceError(error, "We couldn't create this category.")
}

export async function updateExpenseCategory(businessId: string, id: string, input: { name?: string; isActive?: boolean }) {
  const values: { name?: string; is_active?: boolean } = {}
  if (input.name !== undefined) values.name = input.name.trim()
  if (input.isActive !== undefined) values.is_active = input.isActive
  const { data, error } = await requireClient().from("expense_categories").update(values).eq("business_id", businessId).eq("id", id).select("id").maybeSingle()
  if (error) throwFinanceError(error, "We couldn't update this category.")
  if (!data) throw new FinanceDataError("This category is unavailable or cannot be changed.", "CATEGORY_UNAVAILABLE")
}
