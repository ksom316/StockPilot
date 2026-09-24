import { supabase } from "@/lib/supabase"
import { PurchasingDataError, type SupplierProductLink } from "@/features/purchasing/purchasing-types"

function client() {
  if (!supabase) throw new PurchasingDataError("Purchasing is not configured. Refresh and try again.")
  return supabase
}

export async function fetchSupplierProducts(businessId: string): Promise<SupplierProductLink[]> {
  const { data, error } = await client().from("supplier_products")
    .select("id,supplier_id,product_id,is_preferred,products(id,name,sku),suppliers(id,name)")
    .eq("business_id", businessId)
  if (error) throw new PurchasingDataError("We couldn't load supplier relationships. Please try again.", error.code)
  return (data ?? []).map((row) => {
    const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    return {
    id: row.id,
    supplierId: row.supplier_id,
    productId: row.product_id,
    isPreferred: row.is_preferred,
    supplierName: (supplier as { name: string } | null)?.name ?? "",
    productName: (product as { name: string } | null)?.name ?? "",
    productSku: (product as { sku: string | null } | null)?.sku ?? null,
  }
  })
}

export async function linkSupplierProduct(businessId: string, supplierId: string, productId: string) {
  const { error } = await client().from("supplier_products").insert({ business_id: businessId, supplier_id: supplierId, product_id: productId })
  if (error) throw new PurchasingDataError("We couldn't link this product. Check that both records belong to this business.", error.code)
}

export async function setPreferredSupplier(businessId: string, linkId: string, productId: string) {
  const db = client()
  const { error: clearError } = await db.from("supplier_products").update({ is_preferred: false }).eq("business_id", businessId).eq("product_id", productId).eq("is_preferred", true)
  if (clearError) throw new PurchasingDataError("We couldn't change the preferred supplier.", clearError.code)
  const { error } = await db.from("supplier_products").update({ is_preferred: true }).eq("business_id", businessId).eq("id", linkId)
  if (error) throw new PurchasingDataError("We couldn't change the preferred supplier.", error.code)
}

export async function unlinkSupplierProduct(businessId: string, linkId: string) {
  const { error } = await client().from("supplier_products").delete().eq("business_id", businessId).eq("id", linkId)
  if (error) throw new PurchasingDataError("We couldn't unlink this product.", error.code)
}
