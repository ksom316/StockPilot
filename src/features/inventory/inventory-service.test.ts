import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceMocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), rpc: vi.fn() }))

vi.mock("@/lib/supabase", () => ({ supabase: { from: serviceMocks.from, rpc: serviceMocks.rpc } }))

import { createProduct, fetchProducts, recordStockMovement, updateProduct } from "@/features/inventory/inventory-service"
import type { ProductInput } from "@/features/inventory/inventory-types"

const input: ProductInput = {
  name: "USB Cable",
  sku: "USB-1",
  categoryId: "category-1",
  description: null,
  costPrice: "2.1250",
  sellingPrice: "5.5000",
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
