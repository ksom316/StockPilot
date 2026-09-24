import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceMocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), rpc: vi.fn() }))

vi.mock("@/lib/supabase", () => ({ supabase: { from: serviceMocks.from, rpc: serviceMocks.rpc } }))

import { createProduct, fetchInventoryMovements, fetchProducts, recordStockMovement, updateProduct } from "@/features/inventory/inventory-service"
import type { ProductInput } from "@/features/inventory/inventory-types"

const input: ProductInput = {
  name: "USB Cable",
  sku: "USB-1",
  categoryId: "category-1",
  description: null,
  costPrice: "2.1250",
  sellingPrice: "5.5000",
  baseUnit: "unit",
  purchaseUnit: "unit",
  purchaseConversionQuantity: "1",
  lowStockThreshold: "3.250",
  isActive: true,
}

describe("inventory service product writes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMocks.insert.mockResolvedValue({ error: null })
    serviceMocks.eq.mockResolvedValue({ error: null })
    serviceMocks.update.mockReturnValue({ eq: serviceMocks.eq })
    serviceMocks.rpc.mockResolvedValue({ error: null })
    serviceMocks.from.mockReturnValue({ insert: serviceMocks.insert, update: serviceMocks.update })
  })

  it("derives the tenant in the service and omits initial stock", async () => {
    await createProduct("business-1", input)
    expect(serviceMocks.from).toHaveBeenCalledWith("products")
    expect(serviceMocks.insert).toHaveBeenCalledWith(expect.objectContaining({ business_id: "business-1", sku: "USB-1" }))
    expect(serviceMocks.insert.mock.calls[0][0]).not.toHaveProperty("current_quantity")
  })

  it("updates catalog fields without protected quantity or tenant fields", async () => {
    await updateProduct("product-1", input)
    const payload = serviceMocks.update.mock.calls[0][0]
    expect(payload).not.toHaveProperty("current_quantity")
    expect(payload).not.toHaveProperty("business_id")
    expect(serviceMocks.eq).toHaveBeenCalledWith("id", "product-1")
  })

  it("scopes product loading to the current business", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    const businessEq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq: businessEq })
    serviceMocks.from.mockReturnValue({ select })

    await fetchProducts("business-1")

    expect(serviceMocks.from).toHaveBeenCalledWith("products")
    expect(businessEq).toHaveBeenCalledWith("business_id", "business-1")
  })

  it("preserves exact database decimal strings for catalog prices and stock", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "product-1", business_id: "business-1", category_id: null, name: "Precision Item", sku: "PREC-1", description: null, cost_price_text: "1.0001", selling_price_text: "999999999999999.9999", base_unit: "kg", purchase_unit: "carton", purchase_conversion_quantity_text: "10.000", current_quantity_text: "999999999999999.999", low_stock_threshold_text: "0.001", is_active: true, categories: null }], error: null })
    const businessEq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq: businessEq })
    serviceMocks.from.mockReturnValue({ select })

    const products = await fetchProducts("business-1")

    expect(products[0].sellingPrice).toBe("999999999999999.9999")
    expect(products[0].currentQuantity).toBe("999999999999999.999")
    expect(products[0]).toMatchObject({ baseUnit: "kg", purchaseUnit: "carton", purchaseConversionQuantity: "10.000" })
    expect(select).toHaveBeenCalledWith(expect.stringContaining("selling_price_text:selling_price::text"))
  })

  it("preserves exact numeric movement balances and the Sales source", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "movement-1", business_id: "business-1", product_id: "product-1", movement_type: "stock_out", quantity_text: "-0.333", quantity_before_text: "999999999999999.999", quantity_after_text: "999999999999999.666", reason: "Sale SALE-000001", actor_user_id: "user-1", source_type: "sales", source_reference: "sale-1", created_at: "2026-09-22T10:00:00Z", products: { name: "Precision Item", sku: "PREC-1", base_unit: "kg" } }], error: null })
    const businessEq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq: businessEq })
    serviceMocks.from.mockReturnValue({ select })

    const movements = await fetchInventoryMovements("business-1")

    expect(movements[0]).toMatchObject({ quantity: "-0.333", quantityBefore: "999999999999999.999", quantityAfter: "999999999999999.666", baseUnit: "kg", sourceType: "sales", sourceReference: "sale-1" })
    expect(select).toHaveBeenCalledWith(expect.stringContaining("quantity_before_text:quantity_before::text"))
  })

  it("records stock exclusively through the secured RPC", async () => {
    await recordStockMovement({ productId: "product-1", movementType: "stock_out", quantity: "2.5", reason: "Customer return correction" })
    expect(serviceMocks.rpc).toHaveBeenCalledWith("record_inventory_movement", {
      p_product_id: "product-1",
      p_movement_type: "stock_out",
      p_quantity: "2.5",
      p_reason: "Customer return correction",
      p_source_type: "manual",
      p_source_reference: null,
    })
    expect(serviceMocks.update).not.toHaveBeenCalled()
  })
})
