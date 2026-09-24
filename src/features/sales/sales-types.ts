export interface SaleItemInput {
  product_id: string
  quantity: string
  unit_price: string
  selling_unit?: string
}

export type SalesChannel = "walk_in" | "pickup" | "delivery" | "other"
export type PaymentMethod = "cash" | "mobile_money" | "card" | "bank_transfer"

export interface RecordSaleInput {
  items: SaleItemInput[]
  notes: string | null
  customerId?: string | null
  salesChannel?: SalesChannel
  paymentMethod?: PaymentMethod
}

export interface RecordedSale {
  id: string
  sale_reference: string
  customerId?: string | null
  salesChannel?: SalesChannel
  paymentMethod?: PaymentMethod
}

export interface SaleSummary {
  id: string
  businessId: string
  saleReference: string
  customerNameSnapshot: string | null
  soldAt: string
  subtotal: string
  total: string
  notes: string | null
  createdBy: string
  recordedByName?: string | null
  recordedByRole?: "owner" | "manager" | "employee" | "cashier" | null
  salesChannel?: SalesChannel
  paymentMethod?: PaymentMethod
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
  sellingUnit?: string
  sellingConversionQuantity?: string
  inventoryQuantity?: string
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
