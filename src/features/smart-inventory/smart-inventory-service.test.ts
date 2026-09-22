import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceMocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: serviceMocks.rpc } }))

import { fetchSmartInventorySnapshot, SmartInventoryDataError } from "@/features/smart-inventory/smart-inventory-service"

const snapshot = {
  business_id: "business-1",
  timezone: "America/New_York",
  as_of_date: "2026-09-22",
  window: { start_date: "2026-08-23", end_date_exclusive: "2026-09-22", completed_business_dates: 30 },
  modules: { smart_insights_enabled: true, sales_enabled: true },
  pagination: { page: 2, page_size: 10, total_items: 11, total_pages: 2 },
  products: [{
    product_id: "product-1",
    product_name: "Precision Item",
    product_sku: "PREC-1",
    stock: { current_quantity: "999999999999999.999", low_stock_threshold: "0.001", state: "IN_STOCK", reorder_attention: false },
    sales_observation: { enabled: true, eligible_days: 30, complete_window: true, context_code: "RECORDED_SALES_OBSERVED", recorded_sales_quantity: "123456789012345.678", distinct_sale_dates: 6, average_recorded_quantity_per_day: "4115226300411.5226000000000000" },
    days_of_stock: { status: "ESTIMATE_AVAILABLE", unavailable_reason: null, estimated_days: "9.876543210987654321" },
    inventory_movement_observation: { eligible_days: 30, complete_window: true, context_code: "RECORDED_INVENTORY_MOVEMENTS_OBSERVED", movement_count: 2, net_movement_quantity: "-0.333" },
  }],
}

describe("Smart Inventory service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("calls the focused RPC with business-scoped pagination and preserves exact strings", async () => {
    serviceMocks.rpc.mockResolvedValue({ data: snapshot, error: null })
    const result = await fetchSmartInventorySnapshot("business-1", 2, 10)
    expect(serviceMocks.rpc).toHaveBeenCalledWith("get_smart_inventory_snapshot", { p_business_id: "business-1", p_page: 2, p_page_size: 10 })
    expect(result.products[0].stock.currentQuantity).toBe("999999999999999.999")
    expect(result.products[0].salesObservation.recordedSalesQuantity).toBe("123456789012345.678")
    expect(result.products[0].daysOfStock.estimatedDays).toBe("9.876543210987654321")
  })

  it("rejects malformed contract values instead of guessing", async () => {
    serviceMocks.rpc.mockResolvedValue({ data: { ...snapshot, products: [{ ...snapshot.products[0], stock: { ...snapshot.products[0].stock, current_quantity: 4 } }] }, error: null })
    await expect(fetchSmartInventorySnapshot("business-1", 1, 10)).rejects.toBeInstanceOf(SmartInventoryDataError)
  })

  it("maps RPC failures to a safe user-facing data error", async () => {
    serviceMocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } })
    await expect(fetchSmartInventorySnapshot("business-1", 1, 10)).rejects.toThrow("We couldn't load Smart Inventory")
  })
})

