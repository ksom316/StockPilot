export interface ExpenseCategory {
  id: string
  name: string
  isSystem: boolean
  isActive: boolean
}

export interface Expense {
  id: string
  categoryId: string
  categoryName: string
  amount: string
  expenseDate: string
  description: string
  notes: string | null
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  voided: boolean
  voidReason: string | null
  voidedBy: string | null
  voidedAt: string | null
}

export interface ExpenseInput {
  categoryId: string
  amount: string
  expenseDate: string
  description: string
  notes: string | null
}

export interface ExpenseAuditEvent {
  action: "created" | "updated" | "voided"
  actorLabel: string
  changedAt: string
  beforeData: Record<string, unknown> | null
  afterData: Record<string, unknown> | null
}

export class FinanceDataError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = "FinanceDataError"
  }
}
