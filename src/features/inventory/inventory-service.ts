import type { Category, CategoryInput, InventoryMovement, Product, ProductInput, StockMovementInput } from "@/features/inventory/inventory-types"
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
    .select("id, business_id, category_id, name, sku, description, cost_price_text:cost_price::text, selling_price_text:selling_price::text, base_unit, purchase_unit, purchase_conversion_quantity_text:purchase_conversion_quantity::text, current_quantity_text:current_quantity::text, low_stock_threshold_text:low_stock_threshold::text, is_active, categories(name), product_selling_units(id, unit, conversion_quantity_text:conversion_quantity::text, selling_price_text:selling_price::text)")
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
      costPrice: row.cost_price_text,
      sellingPrice: row.selling_price_text,
      baseUnit: row.base_unit,
      purchaseUnit: row.purchase_unit,
      purchaseConversionQuantity: row.purchase_conversion_quantity_text,
      currentQuantity: row.current_quantity_text,
      lowStockThreshold: row.low_stock_threshold_text,
      isActive: row.is_active,
      sellingUnits: (row.product_selling_units ?? []).map((unit) => ({ id: unit.id, unit: unit.unit, conversionQuantity: unit.conversion_quantity_text, sellingPrice: unit.selling_price_text })),
    }
  })
}

export async function fetchInventoryMovements(businessId: string): Promise<InventoryMovement[]> {
  const { data, error } = await requireClient()
    .from("inventory_movements")
    .select("id, business_id, product_id, movement_type, quantity_text:quantity::text, quantity_before_text:quantity_before::text, quantity_after_text:quantity_after::text, reason, actor_user_id, source_type, source_reference, created_at, products(name, sku, base_unit)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })

  if (error) throw new InventoryDataError("We couldn't load movement history.", error.code)
  return (data ?? []).map((row) => {
    const product = row.products as unknown as { name: string; sku: string | null; base_unit: string } | null
    return {
      id: row.id,
      businessId: row.business_id,
      productId: row.product_id,
      productName: product?.name ?? "Unknown product",
      productSku: product?.sku ?? "",
      baseUnit: product?.base_unit ?? "unit",
      movementType: row.movement_type,
      quantity: row.quantity_text,
      quantityBefore: row.quantity_before_text,
      quantityAfter: row.quantity_after_text,
      reason: row.reason,
      actorUserId: row.actor_user_id,
      sourceType: row.source_type,
      sourceReference: row.source_reference,
      createdAt: row.created_at,
    }
  })
}

export async function createProduct(businessId: string, input: ProductInput): Promise<void> {
  const { data, error } = await requireClient().from("products").insert({
    business_id: businessId,
    category_id: input.categoryId,
    name: input.name,
    sku: input.sku,
    description: input.description,
    cost_price: input.costPrice,
    selling_price: input.sellingPrice,
    base_unit: input.baseUnit,
    purchase_unit: input.purchaseUnit,
    purchase_conversion_quantity: input.purchaseConversionQuantity,
    low_stock_threshold: input.lowStockThreshold,
    is_active: input.isActive,
  }).select("id").single()

  if (error) throw new InventoryDataError("We couldn't create this product.", error.code)
  await saveSellingUnits(data.id, input.sellingUnits ?? [])
}

export async function updateProduct(productId: string, input: ProductInput): Promise<void> {
  const { error } = await requireClient().from("products").update({
    category_id: input.categoryId,
    name: input.name,
    sku: input.sku,
    description: input.description,
    cost_price: input.costPrice,
    selling_price: input.sellingPrice,
    base_unit: input.baseUnit,
    purchase_unit: input.purchaseUnit,
    purchase_conversion_quantity: input.purchaseConversionQuantity,
    low_stock_threshold: input.lowStockThreshold,
    is_active: input.isActive,
  }).eq("id", productId)

  if (error) throw new InventoryDataError("We couldn't update this product.", error.code)
  await saveSellingUnits(productId, input.sellingUnits ?? [])
}

async function saveSellingUnits(productId: string, units: NonNullable<ProductInput["sellingUnits"]>) {
  const { error } = await requireClient().rpc("save_product_selling_units", {
    p_product_id: productId,
    p_units: units.map((unit) => ({ unit: unit.unit, conversion_quantity: unit.conversionQuantity, selling_price: unit.sellingPrice })),
  })
  if (error) throw new InventoryDataError("We couldn't save the additional selling units.", error.code)
}

export async function createCategory(businessId: string, input: CategoryInput): Promise<Category> {
  const { data, error } = await requireClient().from("categories").insert({
    business_id: businessId,
    name: input.name,
    description: null,
  }).select("id, name, description").single()

  if (error) throw new InventoryDataError("We couldn't create this category.", error.code)
  return data
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
