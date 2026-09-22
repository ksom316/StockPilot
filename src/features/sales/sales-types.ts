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

export interface SaleSummary {
  id: string
  businessId: string
  saleReference: string
  soldAt: string
  subtotal: string
  total: string
  notes: string | null
  createdBy: string
  itemCount: number
  items: Pick<SaleItem, "productName" | "productSku">[]
}

export interface SaleItem {
  id: string
  productId: string
  productName: string
  productSku: string
  quantity: string
  unitPrice: string
  lineTotal: string
}

export interface SaleDetail extends Omit<SaleSummary, "itemCount" | "items"> {
  items: SaleItem[]
}

export class SalesDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = "SalesDataError"
  }
}
