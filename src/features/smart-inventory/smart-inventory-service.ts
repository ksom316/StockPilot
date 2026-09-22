import { supabase } from "@/lib/supabase"
import type {
  SmartInventoryDaysUnavailableReason,
  SmartInventoryMovementContext,
  SmartInventoryProduct,
  SmartInventorySalesContext,
  SmartInventorySnapshot,
  SmartInventoryStockState,
} from "@/features/smart-inventory/smart-inventory-types"

export class SmartInventoryDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
  }
}

const stockStates = new Set<SmartInventoryStockState>(["OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"])
const salesContexts = new Set<SmartInventorySalesContext>(["RECORDED_SALES_OBSERVED", "NO_RECORDED_SALES_30D", "INSUFFICIENT_HISTORY", "SALES_DISABLED"])
const daysReasons = new Set<SmartInventoryDaysUnavailableReason>(["SALES_DISABLED", "INSUFFICIENT_HISTORY", "OUT_OF_STOCK", "ZERO_RECORDED_SALES", "FEWER_THAN_THREE_SALE_DATES"])
const movementContexts = new Set<SmartInventoryMovementContext>(["NO_RECORDED_INVENTORY_MOVEMENTS_30D", "RECORDED_INVENTORY_MOVEMENTS_OBSERVED", "NO_MOVEMENT_ATTENTION_UNAVAILABLE", "INSUFFICIENT_HISTORY"])

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SmartInventoryDataError(`Smart Inventory returned an invalid ${label}.`)
  return value as Record<string, unknown>
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string") throw new SmartInventoryDataError(`Smart Inventory returned an invalid ${key}.`)
  return value
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  if (typeof value !== "boolean") throw new SmartInventoryDataError(`Smart Inventory returned an invalid ${key}.`)
  return value
}

function requireInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== "number" || !Number.isInteger(value)) throw new SmartInventoryDataError(`Smart Inventory returned an invalid ${key}.`)
  return value
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value !== "string") throw new SmartInventoryDataError(`Smart Inventory returned an invalid ${key}.`)
  return value
}

function nullableInteger(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value !== "number" || !Number.isInteger(value)) throw new SmartInventoryDataError(`Smart Inventory returned an invalid ${key}.`)
  return value
}

function parseProduct(value: unknown): SmartInventoryProduct {
  const record = requireRecord(value, "product")
  const stock = requireRecord(record.stock, "stock")
  const sales = requireRecord(record.sales_observation, "Sales observation")
  const days = requireRecord(record.days_of_stock, "days of stock")
  const movements = requireRecord(record.inventory_movement_observation, "movement observation")
  const state = requireString(stock, "state")
  const salesContext = requireString(sales, "context_code")
  const daysStatus = requireString(days, "status")
  const movementContext = requireString(movements, "context_code")
  const daysReason = days.unavailable_reason

  if (!stockStates.has(state as SmartInventoryStockState)) throw new SmartInventoryDataError("Smart Inventory returned an invalid stock state.")
  if (!salesContexts.has(salesContext as SmartInventorySalesContext)) throw new SmartInventoryDataError("Smart Inventory returned an invalid Sales context.")
  if (daysStatus !== "ESTIMATE_AVAILABLE" && daysStatus !== "DAYS_ESTIMATE_UNAVAILABLE") throw new SmartInventoryDataError("Smart Inventory returned an invalid days estimate status.")
  if (daysReason !== null && (typeof daysReason !== "string" || !daysReasons.has(daysReason as SmartInventoryDaysUnavailableReason))) throw new SmartInventoryDataError("Smart Inventory returned an invalid days estimate reason.")
  if (!movementContexts.has(movementContext as SmartInventoryMovementContext)) throw new SmartInventoryDataError("Smart Inventory returned an invalid movement context.")

  return {
    productId: requireString(record, "product_id"),
    productName: requireString(record, "product_name"),
    productSku: requireString(record, "product_sku"),
    stock: {
      currentQuantity: requireString(stock, "current_quantity"),
      lowStockThreshold: requireString(stock, "low_stock_threshold"),
      state: state as SmartInventoryStockState,
      reorderAttention: requireBoolean(stock, "reorder_attention"),
    },
    salesObservation: {
      enabled: requireBoolean(sales, "enabled"),
      eligibleDays: requireInteger(sales, "eligible_days"),
      completeWindow: requireBoolean(sales, "complete_window"),
      contextCode: salesContext as SmartInventorySalesContext,
      recordedSalesQuantity: nullableString(sales, "recorded_sales_quantity"),
      distinctSaleDates: nullableInteger(sales, "distinct_sale_dates"),
      averageRecordedQuantityPerDay: nullableString(sales, "average_recorded_quantity_per_day"),
    },
    daysOfStock: {
      status: daysStatus as SmartInventoryProduct["daysOfStock"]["status"],
      unavailableReason: daysReason as SmartInventoryDaysUnavailableReason | null,
      estimatedDays: nullableString(days, "estimated_days"),
    },
    inventoryMovementObservation: {
      eligibleDays: requireInteger(movements, "eligible_days"),
      completeWindow: requireBoolean(movements, "complete_window"),
      contextCode: movementContext as SmartInventoryMovementContext,
      movementCount: requireInteger(movements, "movement_count"),
      netMovementQuantity: requireString(movements, "net_movement_quantity"),
    },
  }
}

function parseSnapshot(value: unknown): SmartInventorySnapshot {
  const record = requireRecord(value, "snapshot")
  const window = requireRecord(record.window, "window")
  const modules = requireRecord(record.modules, "modules")
  const pagination = requireRecord(record.pagination, "pagination")
  if (!Array.isArray(record.products)) throw new SmartInventoryDataError("Smart Inventory returned an invalid product list.")

  return {
    businessId: requireString(record, "business_id"),
    timezone: requireString(record, "timezone"),
    asOfDate: requireString(record, "as_of_date"),
    window: {
      startDate: requireString(window, "start_date"),
      endDateExclusive: requireString(window, "end_date_exclusive"),
      completedBusinessDates: requireInteger(window, "completed_business_dates"),
    },
    modules: {
      smartInsightsEnabled: requireBoolean(modules, "smart_insights_enabled"),
      salesEnabled: requireBoolean(modules, "sales_enabled"),
    },
    pagination: {
      page: requireInteger(pagination, "page"),
      pageSize: requireInteger(pagination, "page_size"),
      totalItems: requireInteger(pagination, "total_items"),
      totalPages: requireInteger(pagination, "total_pages"),
    },
    products: record.products.map(parseProduct),
  }
}

export async function fetchSmartInventorySnapshot(businessId: string, page: number, pageSize: number): Promise<SmartInventorySnapshot> {
  if (!supabase) throw new SmartInventoryDataError("Smart Inventory is not configured.")
  const { data, error } = await supabase.rpc("get_smart_inventory_snapshot", {
    p_business_id: businessId,
    p_page: page,
    p_page_size: pageSize,
  })
  if (error) throw new SmartInventoryDataError("We couldn't load Smart Inventory. Please try again.", error.code)
  return parseSnapshot(data)
}

