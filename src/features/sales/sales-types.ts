export interface SaleItemInput {
  product_id: string
  quantity: string
  unit_price: string
}

export interface RecordSaleInput {
  items: SaleItemInput[]
  notes: string | null
}

export interface RecordedSale {
  id: string
  sale_reference: string
}

export class SalesDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = "SalesDataError"
  }
}
