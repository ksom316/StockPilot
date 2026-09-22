import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock("@/lib/supabase", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }))

import { fetchSuppliers, recordPurchase } from "@/features/purchasing/purchasing-service"

describe("purchasing service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.from.mockReturnValue({ select: mock.select })
    mock.select.mockReturnValue({ eq: mock.eq })
    mock.eq.mockReturnValue({ eq: mock.eq, order: mock.order })
  })

  it("loads only active suppliers for the selected business", async () => {
    mock.order.mockResolvedValue({ data: [{ id: "s1", name: "Local Supply", contact_name: null, phone: null, email: null }], error: null })
    await expect(fetchSuppliers("b1")).resolves.toEqual([{ id: "s1", name: "Local Supply", contactName: null, phone: null, email: null }])
    expect(mock.from).toHaveBeenCalledWith("suppliers")
    expect(mock.eq).toHaveBeenNthCalledWith(1, "business_id", "b1")
    expect(mock.eq).toHaveBeenNthCalledWith(2, "is_active", true)
  })

  it("sends exact receipt fields and request UUID to record_purchase", async () => {
    mock.rpc.mockResolvedValue({ data: { id: "purchase-1", purchase_reference: "PUR-000001" }, error: null })
    await expect(recordPurchase({
      items: [{ product_id: "p1", quantity: "1.25", unit_cost: "0" }],
      requestId: "request-1",
      supplierId: null,
      notes: null,
    })).resolves.toEqual({ id: "purchase-1", purchase_reference: "PUR-000001" })
    expect(mock.rpc).toHaveBeenCalledWith("record_purchase", {
      p_items: [{ product_id: "p1", quantity: "1.25", unit_cost: "0" }],
      p_request_id: "request-1",
      p_supplier_id: null,
      p_notes: null,
    })
  })

  it("maps module, validation, and unexpected database errors to user-safe messages", async () => {
    mock.rpc.mockResolvedValueOnce({ error: { code: "42501", message: "Purchasing is not enabled" } })
    await expect(recordPurchase({ items: [], requestId: "r1", supplierId: null, notes: null })).rejects.toThrow(/no longer enabled/i)
    mock.rpc.mockResolvedValueOnce({ error: { code: "22023", message: "raw database details" } })
    await expect(recordPurchase({ items: [], requestId: "r2", supplierId: null, notes: null })).rejects.toThrow(/check the products/i)
    mock.rpc.mockResolvedValueOnce({ error: { code: "XX000", message: "raw database details" } })
    await expect(recordPurchase({ items: [], requestId: "r3", supplierId: null, notes: null })).rejects.not.toThrow(/raw database details/i)
  })
})
