import type { Category, CategoryInput, Product, ProductInput, StockMovementInput } from "@/features/inventory/inventory-types"
import { supabase } from "@/lib/supabase"

export class InventoryDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
  }
}

function requireClient() {
  if (!supabase) throw new InventoryDataError("Inventory is not configured.")
  return supabase
}

export async function fetchCategories(businessId: string): Promise<Category[]> {
  const { data, error } = await requireClient()
    .from("categories")
    .select("id, name, description")
    .eq("business_id", businessId)
    .order("name")

  if (error) throw new InventoryDataError("We couldn't load categories.", error.code)
  return data ?? []
}

export async function fetchProducts(businessId: string): Promise<Product[]> {
  const { data, error } = await requireClient()
    .from("products")
    .select("id, business_id, category_id, name, sku, description, cost_price, selling_price, current_quantity, low_stock_threshold, is_active, categories(name)")
    .eq("business_id", businessId)
    .order("name")

  if (error) throw new InventoryDataError("We couldn't load products.", error.code)
  return (data ?? []).map((row) => {
    const category = row.categories as unknown as { name: string } | null
    return {
      id: row.id,
      businessId: row.business_id,
      categoryId: row.category_id,
      categoryName: category?.name ?? null,
      name: row.name,
      sku: row.sku,
      description: row.description,
      costPrice: String(row.cost_price),
      sellingPrice: String(row.selling_price),
      currentQuantity: String(row.current_quantity),
      lowStockThreshold: String(row.low_stock_threshold),
      isActive: row.is_active,
    }
  })
}

export async function createProduct(businessId: string, input: ProductInput): Promise<void> {
  const { error } = await requireClient().from("products").insert({
    business_id: businessId,
    category_id: input.categoryId,
    name: input.name,
    sku: input.sku,
    description: input.description,
    cost_price: input.costPrice,
    selling_price: input.sellingPrice,
    low_stock_threshold: input.lowStockThreshold,
    is_active: input.isActive,
  })

  if (error) throw new InventoryDataError("We couldn't create this product.", error.code)
}

export async function updateProduct(productId: string, input: ProductInput): Promise<void> {
  const { error } = await requireClient().from("products").update({
    category_id: input.categoryId,
    name: input.name,
    sku: input.sku,
    description: input.description,
    cost_price: input.costPrice,
    selling_price: input.sellingPrice,
    low_stock_threshold: input.lowStockThreshold,
    is_active: input.isActive,
  }).eq("id", productId)

  if (error) throw new InventoryDataError("We couldn't update this product.", error.code)
}

export async function createCategory(businessId: string, input: CategoryInput): Promise<void> {
  const { error } = await requireClient().from("categories").insert({
    business_id: businessId,
    name: input.name,
    description: null,
  })

  if (error) throw new InventoryDataError("We couldn't create this category.", error.code)
}

export async function updateCategory(categoryId: string, input: CategoryInput): Promise<void> {
  const { error } = await requireClient().from("categories").update({ name: input.name }).eq("id", categoryId)
  if (error) throw new InventoryDataError("We couldn't update this category.", error.code)
}

export async function recordStockMovement(input: StockMovementInput): Promise<void> {
  const { error } = await requireClient().rpc("record_inventory_movement", {
    p_product_id: input.productId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_reason: input.reason,
    p_source_type: "manual",
    p_source_reference: null,
  })

  if (!error) return
  if (error.code === "23514" || error.message.toLowerCase().includes("negative stock")) {
    throw new InventoryDataError("There isn't enough stock for this operation. Refresh the catalog and try again.", "INSUFFICIENT_STOCK")
  }
  if (error.code === "42501") {
    throw new InventoryDataError("This stock operation is no longer permitted. Refresh your session and try again.", error.code)
  }
  throw new InventoryDataError("We couldn't record this stock operation. Please try again.", error.code)
}
