export interface InventoryOverview {
  activeProducts: number
  lowStockProducts: number
  outOfStockProducts: number
}

export interface TopProductByUnits {
  productId: string
  productName: string
  productSku: string
  unitsSold: string
  recordedSales: string
}

export interface DailySalesPoint {
  date: string
  recordedSales: string
  saleCount: number
}

export interface SalesOverview {
  enabled: true
  recordedSales: string
  saleCount: number
  averageRecordedSale: string | null
  unitsSold: string
  topProductsByUnitsSold: TopProductByUnits[]
  dailyTrend: DailySalesPoint[]
}

export interface DisabledSalesOverview { enabled: false }

export interface PurchasingOverview {
  enabled: boolean
  available: boolean
  receiptCount?: number
  purchaseReceipts?: string
  quantityReceived?: string
}

export interface BusinessOverview {
  businessId: string
  startDate: string
  endDate: string
  timezone: string
  inventory: InventoryOverview
  sales: SalesOverview | DisabledSalesOverview
  purchasing: PurchasingOverview
}

export class AnalyticsDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = "AnalyticsDataError"
  }
}
