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
  sku: string
  description: string | null
  costPrice: string
  sellingPrice: string
  currentQuantity: string
  lowStockThreshold: string
  isActive: boolean
}

export interface ProductInput {
  name: string
  sku: string
  categoryId: string | null
  description: string | null
  costPrice: string
  sellingPrice: string
  lowStockThreshold: string
  isActive: boolean
}

export interface CategoryInput {
  name: string
}
