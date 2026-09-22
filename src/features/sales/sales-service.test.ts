import { beforeEach, describe, expect, it, vi } from "vitest"

const query = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock("@/lib/supabase", () => ({ supabase: { from: query.from } }))

import { fetchSale, fetchSales } from "@/features/sales/sales-service"

const item = { id: "item-1", product_id: "product-1", product_name: "Phone Case", product_sku: "CASE-01", quantity_text: "2.125", unit_price_text: "50.1234", line_total_text: "106.5122" }
const sale = { id: "sale-1", business_id: "business-1", sale_reference: "SALE-000001", sold_at: "2026-09-20T12:00:00Z", subtotal_text: "106.5122", total_text: "106.5122", notes: "Counter sale", created_by: "user-1", sale_items: [item] }

describe("sales service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.from.mockReturnValue({ select: query.select })
    query.select.mockReturnValue({ eq: query.eq })
    query.eq.mockReturnValue({ eq: query.eq, order: query.order, maybeSingle: query.maybeSingle })
  })

  it("scopes history to the active business and maps snapshot item search data", async () => {
    query.order.mockResolvedValue({ data: [sale], error: null })
    const result = await fetchSales("business-1")

    expect(query.from).toHaveBeenCalledWith("sales")
    expect(query.eq).toHaveBeenCalledWith("business_id", "business-1")
    expect(query.order).toHaveBeenCalledWith("sold_at", { ascending: false })
    expect(result[0]).toMatchObject({ saleReference: "SALE-000001", itemCount: 1, total: "106.5122", items: [{ productName: "Phone Case", productSku: "CASE-01" }] })
  })

  it("preserves large numeric(19,4) totals as exact strings", async () => {
    query.order.mockResolvedValue({ data: [{ ...sale, subtotal_text: "999999999999999.1234", total_text: "999999999999999.1234" }], error: null })
    const result = await fetchSales("business-1")
    expect(result[0].total).toBe("999999999999999.1234")
  })

  it("scopes sale details by both business and sale ID and returns immutable item values", async () => {
    query.maybeSingle.mockResolvedValue({ data: sale, error: null })
    const result = await fetchSale("business-1", "sale-1")

    expect(query.eq).toHaveBeenNthCalledWith(1, "business_id", "business-1")
    expect(query.eq).toHaveBeenNthCalledWith(2, "id", "sale-1")
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("total_text:total::text"))
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("unit_price_text:unit_price::text"))
    expect(result?.items[0]).toEqual({ id: "item-1", productId: "product-1", productName: "Phone Case", productSku: "CASE-01", quantity: "2.125", unitPrice: "50.1234", lineTotal: "106.5122" })
  })
})
