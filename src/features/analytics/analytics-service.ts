import { supabase } from "@/lib/supabase"
import { AnalyticsDataError, type BusinessOverview, type DailySalesPoint, type TopProductByUnits } from "@/features/analytics/analytics-types"

type JsonRecord = Record<string, unknown>
const decimalPattern = /^\d+(?:\.\d+)?$/
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return value as JsonRecord
}

function text(value: unknown, label: string) {
  if (typeof value !== "string") throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return value
}

function decimal(value: unknown, label: string) {
  const result = text(value, label)
  if (!decimalPattern.test(result)) throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return result
}

function count(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new AnalyticsDataError(`The ${label} response was invalid. Refresh and try again.`, "INVALID_RESPONSE")
  return value
}

function parseTopProduct(value: unknown): TopProductByUnits {
  const row = record(value, "top product")
  return {
    productId: text(row.product_id, "top product"),
    productName: text(row.product_name, "top product"),
    productSku: text(row.product_sku, "top product"),
    unitsSold: decimal(row.units_sold, "top product"),
    recordedSales: decimal(row.recorded_sales, "top product"),
  }
}

function parseTrendPoint(value: unknown): DailySalesPoint {
  const row = record(value, "sales trend")
  const date = text(row.date, "sales trend")
  if (!isoDatePattern.test(date)) throw new AnalyticsDataError("The sales trend response was invalid. Refresh and try again.", "INVALID_RESPONSE")
  return { date, recordedSales: decimal(row.recorded_sales, "sales trend"), saleCount: count(row.sale_count, "sales trend") }
}

export function parseBusinessOverview(value: unknown): BusinessOverview {
  const root = record(value, "business overview")
  const inventory = record(root.inventory, "inventory")
  const rawSales = record(root.sales, "sales")
  const rawPurchasing = record(root.purchasing, "Purchasing")
  if (typeof rawSales.enabled !== "boolean" || typeof rawPurchasing.enabled !== "boolean" || typeof rawPurchasing.available !== "boolean") {
    throw new AnalyticsDataError("The business overview response was invalid. Refresh and try again.", "INVALID_RESPONSE")
  }
  const sales = rawSales.enabled ? {
    enabled: true as const,
    recordedSales: decimal(rawSales.recorded_sales, "Sales"),
    saleCount: count(rawSales.sale_count, "Sales"),
    averageRecordedSale: rawSales.average_recorded_sale === null ? null : decimal(rawSales.average_recorded_sale, "Sales"),
    unitsSold: decimal(rawSales.units_sold, "Sales"),
    topProductsByUnitsSold: Array.isArray(rawSales.top_products_by_units_sold) ? rawSales.top_products_by_units_sold.map(parseTopProduct) : (() => { throw new AnalyticsDataError("The Sales response was invalid. Refresh and try again.", "INVALID_RESPONSE") })(),
    dailyTrend: Array.isArray(rawSales.daily_trend) ? rawSales.daily_trend.map(parseTrendPoint) : (() => { throw new AnalyticsDataError("The Sales response was invalid. Refresh and try again.", "INVALID_RESPONSE") })(),
  } : { enabled: false as const }
  const purchasing = rawPurchasing.available ? {
    enabled: rawPurchasing.enabled,
    available: true,
    receiptCount: count(rawPurchasing.receipt_count, "Purchasing"),
    purchaseReceipts: decimal(rawPurchasing.purchase_receipts, "Purchasing"),
    quantityReceived: decimal(rawPurchasing.quantity_received, "Purchasing"),
  } : { enabled: rawPurchasing.enabled, available: false }
  return {
    businessId: text(root.business_id, "business overview"),
    startDate: text(root.start_date, "business overview"),
    endDate: text(root.end_date, "business overview"),
    timezone: text(root.timezone, "business overview"),
    inventory: {
      activeProducts: count(inventory.active_products, "inventory"),
      lowStockProducts: count(inventory.low_stock_products, "inventory"),
      outOfStockProducts: count(inventory.out_of_stock_products, "inventory"),
    },
    sales,
    purchasing,
  }
}

export async function fetchBusinessOverview(businessId: string, startDate: string, endDate: string) {
  if (!supabase) throw new AnalyticsDataError("Dashboard analytics are unavailable. Refresh and try again.")
  const { data, error } = await supabase.rpc("get_business_overview", {
    p_business_id: businessId,
    p_start_date: startDate,
    p_end_date: endDate,
  })
  if (error) throw new AnalyticsDataError("We couldn't load this period's dashboard overview. Please try again.", error.code)
  const parsed = parseBusinessOverview(data)
  if (parsed.businessId !== businessId || parsed.startDate !== startDate || parsed.endDate !== endDate) {
    throw new AnalyticsDataError("The dashboard returned data for a different workspace or period. Refresh and try again.", "SCOPE_MISMATCH")
  }
  return parsed
}
