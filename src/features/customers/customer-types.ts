export interface BasicCustomer {
  id: string
  name: string
  phone: string | null
  email: string | null
  isActive: boolean
}

export interface ManagedCustomer extends BasicCustomer {
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerInput {
  name: string
  phone: string | null
  email: string | null
  note: string | null
}

export interface CustomerActivitySale {
  id: string
  saleReference: string
  soldAt: string
  total: string
  customerNameSnapshot: string
  itemCount: number
}

export interface CustomerActivity extends ManagedCustomer {
  saleCount: number
  recordedSalesTotal: string
  firstSaleAt: string | null
  lastSaleAt: string | null
  sales: CustomerActivitySale[]
}

export class CustomerDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = "CustomerDataError"
  }
}
