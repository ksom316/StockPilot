import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock("@/lib/supabase", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }))

import { createSupplier, fetchPurchase, fetchPurchases, fetchSuppliers, recordPurchase, updateSupplier } from "@/features/purchasing/purchasing-service"

describe("purchasing service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.from.mockReturnValue({ select: mock.select, update: mock.update, insert: mock.insert })
    mock.select.mockReturnValue({ eq: mock.eq, maybeSingle: mock.maybeSingle })
    mock.update.mockReturnValue({ eq: mock.eq })
    mock.eq.mockReturnValue({ eq: mock.eq, order: mock.order, maybeSingle: mock.maybeSingle, select: mock.select })
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

  it("loads purchase history scoped to business with numeric snapshots kept as strings", async () => {
    mock.order.mockResolvedValue({ data: [{ id: "purchase-1", business_id: "b1", purchase_reference: "PUR-000001", received_at: "2026-09-22T10:00:00Z", supplier_name: "Original supplier", subtotal_text: "999999999999999.9999", total_text: "999999999999999.9999", notes: null, created_by: "user-1", purchase_items: [{ id: "item-1", product_name: "Original product", product_sku: "ORIG-1", quantity_text: "123456789012345.678", unit_cost_text: "123456789012345.6789", line_total_text: "999999999999999.9999", base_unit: "piece", purchase_unit: "carton", conversion_quantity_text: "10.000", inventory_quantity_text: "999999999999999.999", base_unit_cost_text: "12345678901234.5679" }] }], error: null })

    await expect(fetchPurchases("b1")).resolves.toEqual([{
      id: "purchase-1", purchaseReference: "PUR-000001", receivedAt: "2026-09-22T10:00:00Z", supplierName: "Original supplier",
      subtotal: "999999999999999.9999", total: "999999999999999.9999", notes: null, itemCount: 1,
      items: [{ productName: "Original product", productSku: "ORIG-1" }],
    }])
    expect(mock.from).toHaveBeenCalledWith("purchases")
    expect(mock.eq).toHaveBeenCalledWith("business_id", "b1")
    expect(mock.order).toHaveBeenCalledWith("received_at", { ascending: false })
  })

  it("scopes purchase details by both current business and purchase ID and returns stored snapshots", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { id: "purchase-1", business_id: "b1", purchase_reference: "PUR-000001", received_at: "2026-09-22T10:00:00Z", supplier_name: "Snapshot supplier", subtotal_text: "25.0000", total_text: "25.0000", notes: null, created_by: "user-1", purchase_items: [{ id: "item-1", product_name: "Old name", product_sku: "OLD-SKU", quantity_text: "2.5", unit_cost_text: "10.0000", line_total_text: "25.0000", base_unit: "pack", purchase_unit: "carton", conversion_quantity_text: "20.000", inventory_quantity_text: "50.000", base_unit_cost_text: "0.5000" }] }, error: null })

    await expect(fetchPurchase("b1", "purchase-1")).resolves.toMatchObject({ supplierName: "Snapshot supplier", items: [{ productName: "Old name", productSku: "OLD-SKU", unitCost: "10.0000", lineTotal: "25.0000", baseUnit: "pack", purchaseUnit: "carton", conversionQuantity: "20.000", inventoryQuantity: "50.000", baseUnitCost: "0.5000" }] })
    expect(mock.from).toHaveBeenCalledWith("purchases")
    expect(mock.eq).toHaveBeenNthCalledWith(1, "business_id", "b1")
    expect(mock.eq).toHaveBeenNthCalledWith(2, "id", "purchase-1")
  })

  it("does not let supplier payloads choose a tenant and treats RLS-filtered updates as unavailable", async () => {
    mock.insert.mockResolvedValue({ error: null })
    const input = { name: "Safe supplier", contact_name: null, phone: null, email: null, notes: null, business_id: "attacker-business", id: "attacker-id" }
    await createSupplier("business-1", input)
    expect(mock.insert).toHaveBeenCalledWith({ business_id: "business-1", name: "Safe supplier", contact_name: null, phone: null, email: null, notes: null })

    mock.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(updateSupplier("business-1", "supplier-1", input)).rejects.toThrow(/unavailable or you no longer have permission/i)
    expect(mock.update).toHaveBeenCalledWith({ name: "Safe supplier", contact_name: null, phone: null, email: null, notes: null })
    expect(mock.eq).toHaveBeenNthCalledWith(1, "business_id", "business-1")
    expect(mock.eq).toHaveBeenNthCalledWith(2, "id", "supplier-1")
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
