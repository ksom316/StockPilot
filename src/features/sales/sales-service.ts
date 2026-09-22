import { supabase } from "@/lib/supabase"
import { SalesDataError, type RecordedSale, type RecordSaleInput } from "@/features/sales/sales-types"

export async function recordSale(input: RecordSaleInput): Promise<RecordedSale> {
  if (!supabase) throw new SalesDataError("Sales is not configured. Refresh and try again.")

  const { data, error } = await supabase.rpc("record_sale", {
    p_items: input.items,
    p_notes: input.notes,
  })

  if (error) {
    if (error.code === "23514") throw new SalesDataError("There isn't enough stock for one or more items. Stock has been refreshed; review your cart and try again.", "INSUFFICIENT_STOCK")
    if (error.code === "22023") throw new SalesDataError("Check the quantities and prices in your sale, then try again.", "INVALID_SALE")
    if (error.code === "42501" && error.message.toLowerCase().includes("sales is not enabled")) throw new SalesDataError("Sales is no longer enabled for this business. Refresh your workspace.", "SALES_DISABLED")
    if (error.code === "42501") throw new SalesDataError("Your workspace or product access changed. Refresh the product list and try again.", "ACCESS_CHANGED")
    throw new SalesDataError("We couldn't record this sale. Your cart is still here; please try again.", error.code)
  }

  if (!data || typeof data !== "object" || !("id" in data) || !("sale_reference" in data)) {
    throw new SalesDataError("The sale was recorded, but its confirmation could not be read. Refresh the page before retrying.", "INVALID_RESPONSE")
  }

  return { id: String(data.id), sale_reference: String(data.sale_reference) }
}
