export interface Supplier {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
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
