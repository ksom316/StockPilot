export interface Supplier {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
}

export interface ManagedSupplier extends Supplier {
  notes: string | null
  isActive: boolean
  products?: SupplierProductLink[]
}

export interface SupplierProductLink {
  id: string
  supplierId: string
  productId: string
  supplierName: string
  productName: string
  productSku: string | null
  isPreferred: boolean
}

export interface SupplierInput {
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

export interface PurchaseItem {
  id: string
  productName: string
  productSku: string | null
  quantity: string
  unitCost: string
  lineTotal: string
  baseUnit: string
  purchaseUnit: string
  conversionQuantity: string
  inventoryQuantity: string
  baseUnitCost: string
}

export interface PurchaseSummary {
  id: string
  purchaseReference: string
  receivedAt: string
  supplierName: string | null
  subtotal: string
  total: string
  notes: string | null
  itemCount: number
  items: Pick<PurchaseItem, "productName" | "productSku">[]
}

export interface PurchaseDetail extends Omit<PurchaseSummary, "itemCount" | "items"> {
  items: PurchaseItem[]
}

export interface PurchaseItemInput {
  product_id: string
  quantity: string
  unit_cost: string
}

export interface RecordPurchaseInput {
  items: PurchaseItemInput[]
  requestId: string
  supplierId: string | null
  notes: string | null
}

export interface RecordedPurchase {
  id: string
  purchase_reference: string
}

export class PurchasingDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = "PurchasingDataError"
  }
}
