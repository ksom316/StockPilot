import { supabase } from "@/lib/supabase"
import { PurchasingDataError, type RecordedPurchase, type RecordPurchaseInput, type Supplier } from "@/features/purchasing/purchasing-types"

function requireClient() {
  if (!supabase) throw new PurchasingDataError("Purchasing is not configured. Refresh and try again.")
  return supabase
}

export async function fetchSuppliers(businessId: string): Promise<Supplier[]> {
  const { data, error } = await requireClient()
    .from("suppliers")
    .select("id,name,contact_name,phone,email")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name")

  if (error) throw new PurchasingDataError("We couldn't load suppliers. You can still receive stock without a supplier.", error.code)
  return (data ?? []).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contact_name,
    phone: supplier.phone,
    email: supplier.email,
  }))
}

export async function recordPurchase(input: RecordPurchaseInput): Promise<RecordedPurchase> {
  const { data, error } = await requireClient().rpc("record_purchase", {
    p_items: input.items,
    p_request_id: input.requestId,
    p_supplier_id: input.supplierId,
    p_notes: input.notes,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (error.code === "42501" && message.includes("not enabled")) {
      throw new PurchasingDataError("Purchasing is no longer enabled for this business. Refresh your workspace.", "PURCHASING_DISABLED")
    }
    if (error.code === "42501" && (message.includes("supplier") || message.includes("product"))) {
      throw new PurchasingDataError("A selected supplier or product is no longer available. Refresh and review this receipt.", "ACCESS_CHANGED")
    }
    if (error.code === "42501") {
      throw new PurchasingDataError("Your workspace does not have permission to record purchases.", "ACCESS_DENIED")
    }
    if (error.code === "22023") {
      throw new PurchasingDataError("Check the products, quantities, and unit costs in this receipt.", "INVALID_PURCHASE")
    }
    if (error.code === "22003" || error.code === "22001" || error.code === "23514" || error.code === "numeric_value_out_of_range") {
      throw new PurchasingDataError("One or more quantities or costs exceed the supported limits. Adjust this receipt and try again.", "PURCHASE_LIMIT")
    }
    throw new PurchasingDataError("We couldn't record this receipt. Your items are still here; retry using the same receipt.", error.code)
  }

  if (!data || typeof data !== "object" || !("id" in data) || !("purchase_reference" in data)) {
    throw new PurchasingDataError("The receipt may have been recorded, but its confirmation could not be read. Retry this same receipt to check safely.", "INVALID_RESPONSE")
  }

  return { id: String(data.id), purchase_reference: String(data.purchase_reference) }
}
