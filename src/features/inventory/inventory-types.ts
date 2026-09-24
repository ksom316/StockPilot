export interface Category {
  id: string
  name: string
  description: string | null
}

export interface Product {
  id: string
  businessId: string
  categoryId: string | null
  categoryName: string | null
  name: string
  sku: string | null
  description: string | null
  costPrice: string
  sellingPrice: string
  baseUnit: string
  purchaseUnit: string
  purchaseConversionQuantity: string
  currentQuantity: string
  lowStockThreshold: string
  isActive: boolean
}

export interface ProductInput {
  name: string
  sku: string | null
  categoryId: string | null
  description: string | null
  costPrice: string
  sellingPrice: string
  baseUnit: string
  purchaseUnit: string
  purchaseConversionQuantity: string
  lowStockThreshold: string
  isActive: boolean
}

export interface CategoryInput {
  name: string
}

export type InventoryMovementType = "stock_in" | "stock_out" | "adjustment" | "damaged" | "lost"

export interface StockMovementInput {
  productId: string
  movementType: InventoryMovementType
  quantity: string
  reason: string | null
}

export interface InventoryMovement {
  id: string
  businessId: string
  productId: string
  productName: string
  productSku: string
  baseUnit: string
  movementType: InventoryMovementType
  quantity: string
  quantityBefore: string
  quantityAfter: string
  reason: string | null
  actorUserId: string | null
  sourceType: string
  sourceReference: string | null
  createdAt: string
}
