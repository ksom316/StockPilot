export type SmartInventoryStockState = "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK"

export type SmartInventorySalesContext =
  | "RECORDED_SALES_OBSERVED"
  | "NO_RECORDED_SALES_30D"
  | "INSUFFICIENT_HISTORY"
  | "SALES_DISABLED"

export type SmartInventoryDaysUnavailableReason =
  | "SALES_DISABLED"
  | "INSUFFICIENT_HISTORY"
  | "OUT_OF_STOCK"
  | "ZERO_RECORDED_SALES"
  | "FEWER_THAN_THREE_SALE_DATES"

export type SmartInventoryMovementContext =
  | "NO_RECORDED_INVENTORY_MOVEMENTS_30D"
  | "RECORDED_INVENTORY_MOVEMENTS_OBSERVED"
  | "NO_MOVEMENT_ATTENTION_UNAVAILABLE"
  | "INSUFFICIENT_HISTORY"

export interface SmartInventoryProduct {
  productId: string
  productName: string
  productSku: string
  stock: {
    currentQuantity: string
    lowStockThreshold: string
    state: SmartInventoryStockState
    reorderAttention: boolean
  }
  salesObservation: {
    enabled: boolean
    eligibleDays: number
    completeWindow: boolean
    contextCode: SmartInventorySalesContext
    recordedSalesQuantity: string | null
    distinctSaleDates: number | null
    averageRecordedQuantityPerDay: string | null
  }
  daysOfStock: {
    status: "ESTIMATE_AVAILABLE" | "DAYS_ESTIMATE_UNAVAILABLE"
    unavailableReason: SmartInventoryDaysUnavailableReason | null
    estimatedDays: string | null
  }
  inventoryMovementObservation: {
    eligibleDays: number
    completeWindow: boolean
    contextCode: SmartInventoryMovementContext
    movementCount: number
    netMovementQuantity: string
  }
}

export interface SmartInventorySnapshot {
  businessId: string
  timezone: string
  asOfDate: string
  window: {
    startDate: string
    endDateExclusive: string
    completedBusinessDates: number
  }
  modules: {
    smartInsightsEnabled: boolean
    salesEnabled: boolean
  }
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  products: SmartInventoryProduct[]
}

