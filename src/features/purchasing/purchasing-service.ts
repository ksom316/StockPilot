import { supabase } from "@/lib/supabase"
import { PurchasingDataError, type ManagedSupplier, type PurchaseDetail, type PurchaseItem, type PurchaseSummary, type RecordedPurchase, type RecordPurchaseInput, type Supplier, type SupplierInput } from "@/features/purchasing/purchasing-types"

const purchaseSelect = "id,business_id,purchase_reference,received_at,supplier_name,subtotal_text:subtotal::text,total_text:total::text,notes,created_by,purchase_items(id,product_name,product_sku,quantity_text:quantity::text,unit_cost_text:unit_cost::text,line_total_text:line_total::text,base_unit,purchase_unit,conversion_quantity_text:purchase_conversion_quantity::text,inventory_quantity_text:inventory_quantity::text,base_unit_cost_text:base_unit_cost::text)"

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

export async function fetchManagedSuppliers(businessId: string): Promise<ManagedSupplier[]> {
  const { data, error } = await requireClient().from("suppliers").select("id,name,contact_name,phone,email,notes,is_active").eq("business_id", businessId).order("name")
  if (error) throw new PurchasingDataError("We couldn't load suppliers. Please try again.", error.code)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, contactName: row.contact_name, phone: row.phone, email: row.email, notes: row.notes, isActive: row.is_active }))
}

export async function createSupplier(businessId: string, input: SupplierInput) {
  const { error } = await requireClient().from("suppliers").insert({
    business_id: businessId,
    name: input.name,
    contact_name: input.contact_name,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
  })
  if (error) throw new PurchasingDataError("We couldn't save this supplier. Check the details and try again.", error.code)
}

export async function updateSupplier(businessId: string, supplierId: string, input: SupplierInput) {
  const { data, error } = await requireClient().from("suppliers").update({
    name: input.name,
    contact_name: input.contact_name,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
  }).eq("business_id", businessId).eq("id", supplierId).select("id").maybeSingle()
  if (error) throw new PurchasingDataError("We couldn't update this supplier. Please try again.", error.code)
  if (!data) throw new PurchasingDataError("This supplier is unavailable or you no longer have permission to update it.", "SUPPLIER_UNAVAILABLE")
}

export async function setSupplierActive(businessId: string, supplierId: string, isActive: boolean) {
  const { data, error } = await requireClient().from("suppliers").update({ is_active: isActive }).eq("business_id", businessId).eq("id", supplierId).select("id").maybeSingle()
  if (error) throw new PurchasingDataError("We couldn't update this supplier. Please try again.", error.code)
  if (!data) throw new PurchasingDataError("This supplier is unavailable or you no longer have permission to update it.", "SUPPLIER_UNAVAILABLE")
}

export async function fetchPurchases(businessId: string): Promise<PurchaseSummary[]> {
  const { data, error } = await requireClient().from("purchases").select(purchaseSelect).eq("business_id", businessId).order("received_at", { ascending: false })
  if (error) throw new PurchasingDataError("We couldn't load purchase history. Please try again.", error.code)
  return (data ?? []).map((row) => {
    const items = (row.purchase_items ?? []).map(mapPurchaseItem)
    return { id: row.id, purchaseReference: row.purchase_reference, receivedAt: row.received_at, supplierName: row.supplier_name, subtotal: row.subtotal_text, total: row.total_text, notes: row.notes, itemCount: items.length, items: items.map(({ productName, productSku }) => ({ productName, productSku })) }
  })
}

export async function fetchPurchase(businessId: string, purchaseId: string): Promise<PurchaseDetail | null> {
  const { data, error } = await requireClient().from("purchases").select(purchaseSelect).eq("business_id", businessId).eq("id", purchaseId).maybeSingle()
  if (error) throw new PurchasingDataError("We couldn't load this purchase. Please try again.", error.code)
  if (!data) return null
  return { id: data.id, purchaseReference: data.purchase_reference, receivedAt: data.received_at, supplierName: data.supplier_name, subtotal: data.subtotal_text, total: data.total_text, notes: data.notes, items: (data.purchase_items ?? []).map(mapPurchaseItem) }
}

function mapPurchaseItem(row: { id: string; product_name: string; product_sku: string | null; quantity_text: string; unit_cost_text: string; line_total_text: string; base_unit: string; purchase_unit: string; conversion_quantity_text: string; inventory_quantity_text: string; base_unit_cost_text: string }): PurchaseItem {
  return { id: row.id, productName: row.product_name, productSku: row.product_sku, quantity: row.quantity_text, unitCost: row.unit_cost_text, lineTotal: row.line_total_text, baseUnit: row.base_unit, purchaseUnit: row.purchase_unit, conversionQuantity: row.conversion_quantity_text, inventoryQuantity: row.inventory_quantity_text, baseUnitCost: row.base_unit_cost_text }
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
