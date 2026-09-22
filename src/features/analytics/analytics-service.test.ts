import { describe, expect, it } from "vitest"
import { parseBusinessOverview } from "@/features/analytics/analytics-service"

const response = {
  business_id: "business-1", start_date: "2026-09-01", end_date: "2026-09-30", timezone: "America/New_York",
  inventory: { active_products: 2, low_stock_products: 1, out_of_stock_products: 0 },
  sales: { enabled: true, recorded_sales: "9007199254740993.1234", sale_count: 1, average_recorded_sale: "9007199254740993.1234", units_sold: "1.125", top_products_by_units_sold: [{ product_id: "product-1", product_name: "Historic Name", product_sku: "OLD-1", units_sold: "1.125", recorded_sales: "9007199254740993.1234" }], daily_trend: [{ date: "2026-09-01", recorded_sales: "9007199254740993.1234", sale_count: 1 }] },
  purchasing: { enabled: true, available: false },
}

describe("business overview response parsing", () => {
  it("maps structured RPC data while preserving decimals as strings and restricted Purchasing as unavailable", () => {
    const result = parseBusinessOverview(response)
    expect(result).toMatchObject({ businessId: "business-1", startDate: "2026-09-01", endDate: "2026-09-30", timezone: "America/New_York" })
    expect(result.sales.enabled).toBe(true)
    if (result.sales.enabled) {
      expect(result.sales.recordedSales).toBe("9007199254740993.1234")
      expect(result.sales.topProductsByUnitsSold[0].productName).toBe("Historic Name")
      expect(result.sales.dailyTrend[0].recordedSales).toBe("9007199254740993.1234")
    }
    expect(result.purchasing).toEqual({ enabled: true, available: false })
  })

  it("accepts disabled modules and an empty enabled Sales period", () => {
    const result = parseBusinessOverview({ ...response, sales: { enabled: false }, purchasing: { enabled: false, available: false } })
    expect(result.sales).toEqual({ enabled: false })
    expect(result.purchasing).toEqual({ enabled: false, available: false })
    const empty = parseBusinessOverview({ ...response, sales: { ...response.sales, recorded_sales: "0.0000", sale_count: 0, average_recorded_sale: null, units_sold: "0.000", top_products_by_units_sold: [], daily_trend: [] } })
    expect(empty.sales.enabled && empty.sales.averageRecordedSale).toBeNull()
  })

  it("rejects malformed decimal or count values rather than coercing them through Number", () => {
    expect(() => parseBusinessOverview({ ...response, sales: { ...response.sales, recorded_sales: 0.1 } })).toThrow(/response was invalid/i)
    expect(() => parseBusinessOverview({ ...response, inventory: { ...response.inventory, active_products: 1.5 } })).toThrow(/response was invalid/i)
  })
})
