import { supabase } from "@/lib/supabase"
import { AnalyticsDataError } from "@/features/analytics/analytics-types"
import type { AnalyticsProductPoint, AnalyticsTrendPoint, AnalyticsWorkspace } from "@/features/analytics/analytics-workspace-types"

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/
const decimalPattern = /^-?\d+(?:\.\d+)?$/

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return value as Record<string, unknown>
}
function stringValue(value: unknown, label: string) {
  if (typeof value !== "string") throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return value
}
function dateValue(value: unknown, label: string) {
  const date = stringValue(value, label)
  if (!isoDatePattern.test(date)) throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return date
}
function decimalValue(value: unknown, label: string): string {
  if (value === null) return "null"
  const result = stringValue(value, label)
  if (!decimalPattern.test(result)) throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return result
}
function integerValue(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return value
}
function booleanValue(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return value
}
function parseTrend(value: unknown, label: string): AnalyticsTrendPoint {
  const row = object(value, label)
  return {
    date: dateValue(row.date, label),
    ...(row.recorded_sales !== undefined ? { recordedSales: decimalValue(row.recorded_sales, label), saleCount: integerValue(row.sale_count, label) } : {}),
    ...(row.purchase_receipts !== undefined ? { purchaseReceipts: decimalValue(row.purchase_receipts, label), receiptCount: integerValue(row.receipt_count, label) } : {}),
    ...(row.estimated_gross_profit !== undefined ? { estimatedGrossProfit: row.estimated_gross_profit === null ? null : decimalValue(row.estimated_gross_profit, label), operatingExpenses: decimalValue(row.operating_expenses, label), estimatedNetProfit: row.estimated_net_profit === null ? null : decimalValue(row.estimated_net_profit, label), costCoverageComplete: booleanValue(row.cost_coverage_complete, label) } : {}),
  }
}
function parseProduct(value: unknown): AnalyticsProductPoint {
  const row = object(value, "top product")
  return { productId: stringValue(row.product_id, "top product"), productName: stringValue(row.product_name, "top product"), productSku: stringValue(row.product_sku, "top product"), unitsSold: decimalValue(row.units_sold, "top product"), recordedSales: decimalValue(row.recorded_sales, "top product") }
}

export function parseAnalyticsWorkspace(value: unknown): AnalyticsWorkspace {
  const root = object(value, "analytics workspace")
  const sales = object(root.sales, "Sales analytics")
  const purchasing = object(root.purchasing, "Purchasing analytics")
  const finance = object(root.finance, "Finance analytics")
  const parseTrends = (raw: unknown, label: string) => Array.isArray(raw) ? raw.map((item) => parseTrend(item, label)) : []
  const parseProducts = (raw: unknown) => Array.isArray(raw) ? raw.map(parseProduct) : []
  return {
    businessId: stringValue(root.business_id, "analytics workspace"), startDate: dateValue(root.start_date, "analytics workspace"), endDate: dateValue(root.end_date, "analytics workspace"), timezone: stringValue(root.timezone, "analytics workspace"),
    sales: { enabled: booleanValue(sales.enabled, "Sales analytics"), dailyTrend: parseTrends(sales.daily_trend, "Sales trend"), topProductsByRevenue: parseProducts(sales.top_products_by_revenue), topProductsByUnits: parseProducts(sales.top_products_by_units) },
    purchasing: { enabled: booleanValue(purchasing.enabled, "Purchasing analytics"), available: booleanValue(purchasing.available, "Purchasing analytics"), dailyTrend: parseTrends(purchasing.daily_trend, "Purchasing trend") },
    finance: { enabled: booleanValue(finance.enabled, "Finance analytics"), dailyTrend: parseTrends(finance.daily_trend, "Finance trend") },
  }
}

export async function fetchAnalyticsWorkspace(businessId: string, startDate: string, endDate: string) {
  if (!supabase) throw new AnalyticsDataError("Analytics are unavailable. Refresh and try again.")
  const { data, error } = await supabase.rpc("get_analytics_workspace", { p_business_id: businessId, p_start_date: startDate, p_end_date: endDate })
  if (error) throw new AnalyticsDataError("We couldn't load this analytics period. Please try again.", error.code)
  const parsed = parseAnalyticsWorkspace(data)
  if (parsed.businessId !== businessId || parsed.startDate !== startDate || parsed.endDate !== endDate) throw new AnalyticsDataError("Analytics returned data for a different workspace or period. Refresh and try again.", "SCOPE_MISMATCH")
  return parsed
}
