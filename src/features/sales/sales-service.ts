import { supabase } from "@/lib/supabase"
import { SalesDataError, type RecordedSale, type RecordSaleInput, type SaleDetail, type SaleItem, type SaleSummary } from "@/features/sales/sales-types"

const saleSelect = "id,business_id,sale_reference,customer_name_snapshot,sold_at,subtotal_text:subtotal::text,total_text:total::text,notes,created_by,sale_items(id,product_id,product_name,product_sku,quantity_text:quantity::text,unit_price_text:unit_price::text,line_total_text:line_total::text)"

export async function recordSale(input: RecordSaleInput): Promise<RecordedSale> {
  if (!supabase) throw new SalesDataError("Sales is not configured. Refresh and try again.")

  const { data, error } = await supabase.rpc("record_sale", {
    p_items: input.items,
    p_notes: input.notes,
    p_customer_id: input.customerId ?? null,
  })

  if (error) {
    if (error.code === "23514") throw new SalesDataError("There isn't enough stock for one or more items. Stock has been refreshed; review your cart and try again.", "INSUFFICIENT_STOCK")
    if (error.code === "22023") throw new SalesDataError("Check the quantities and prices in your sale, then try again.", "INVALID_SALE")
    if (error.code === "42501" && error.message.toLowerCase().includes("customers is not enabled")) throw new SalesDataError("Customers was disabled before the sale could be saved. Your cart is still here; review it before recording without a customer.", "CUSTOMERS_DISABLED")
    if (error.code === "42501" && error.message.toLowerCase().includes("customer")) throw new SalesDataError("This customer is no longer available. Choose another customer or switch to Walk-in. Your cart is still here.", "CUSTOMER_UNAVAILABLE")
    if (error.code === "42501" && error.message.toLowerCase().includes("sales is not enabled")) throw new SalesDataError("Sales is no longer enabled for this business. Refresh your workspace.", "SALES_DISABLED")
    if (error.code === "42501") throw new SalesDataError("Your workspace or product access changed. Refresh the product list and try again.", "ACCESS_CHANGED")
    throw new SalesDataError("We couldn't record this sale. Your cart is still here; please try again.", error.code)
  }

  if (!data || typeof data !== "object" || !("id" in data) || !("sale_reference" in data)) {
    throw new SalesDataError("The sale was recorded, but its confirmation could not be read. Refresh the page before retrying.", "INVALID_RESPONSE")
  }

  return { id: String(data.id), sale_reference: String(data.sale_reference), customerId: typeof data.customer_id === "string" ? data.customer_id : null }
}

export async function fetchSales(businessId: string): Promise<SaleSummary[]> {
  if (!supabase) throw new SalesDataError("Sales history is not configured. Refresh and try again.")
  const { data, error } = await supabase
    .from("sales")
    .select(saleSelect)
    .eq("business_id", businessId)
    .order("sold_at", { ascending: false })

  if (error) throw new SalesDataError("We couldn't load sales history. Please try again.", error.code)
  return (data ?? []).map((row) => {
    const items = (row.sale_items ?? []).map(mapSaleItem)
    return {
      id: row.id,
      businessId: row.business_id,
      saleReference: row.sale_reference,
      customerNameSnapshot: row.customer_name_snapshot,
      soldAt: row.sold_at,
      subtotal: row.subtotal_text,
      total: row.total_text,
      notes: row.notes,
      createdBy: row.created_by,
      itemCount: items.length,
      items: items.map(({ productName, productSku }) => ({ productName, productSku })),
    }
  })
}

export async function fetchSale(businessId: string, saleId: string): Promise<SaleDetail | null> {
  if (!supabase) throw new SalesDataError("Sale details are not configured. Refresh and try again.")
  const { data, error } = await supabase
    .from("sales")
    .select(saleSelect)
    .eq("business_id", businessId)
    .eq("id", saleId)
    .maybeSingle()

  if (error) throw new SalesDataError("We couldn't load this sale. Please try again.", error.code)
  if (!data) return null
  const items = (data.sale_items ?? []).map(mapSaleItem)
  return {
    id: data.id,
    businessId: data.business_id,
    saleReference: data.sale_reference,
    customerNameSnapshot: data.customer_name_snapshot,
    soldAt: data.sold_at,
    subtotal: data.subtotal_text,
    total: data.total_text,
    notes: data.notes,
    createdBy: data.created_by,
    items,
  }
}

function mapSaleItem(row: {
  id: string
  product_id: string
  product_name: string
  product_sku: string
  quantity_text: string
  unit_price_text: string
  line_total_text: string
}): SaleItem {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    quantity: row.quantity_text,
    unitPrice: row.unit_price_text,
    lineTotal: row.line_total_text,
  }
}
