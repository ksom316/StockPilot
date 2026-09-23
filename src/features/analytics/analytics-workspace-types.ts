export interface AnalyticsTrendPoint {
  date: string
  recordedSales?: string
  saleCount?: number
  purchaseReceipts?: string
  receiptCount?: number
  estimatedGrossProfit?: string | null
  operatingExpenses?: string
  estimatedNetProfit?: string | null
  costCoverageComplete?: boolean
}

export interface AnalyticsProductPoint {
  productId: string
  productName: string
  productSku: string
  unitsSold: string
  recordedSales: string
}

export interface AnalyticsWorkspace {
  businessId: string
  startDate: string
  endDate: string
  timezone: string
  sales: { enabled: boolean; dailyTrend: AnalyticsTrendPoint[]; topProductsByRevenue: AnalyticsProductPoint[]; topProductsByUnits: AnalyticsProductPoint[] }
  purchasing: { enabled: boolean; available: boolean; dailyTrend: AnalyticsTrendPoint[] }
  finance: { enabled: boolean; dailyTrend: AnalyticsTrendPoint[] }
}
