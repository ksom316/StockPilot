export type OpportunitySignalType = "RESTOCK_DEMAND" | "SALES_MOMENTUM" | "SLOW_MOVING_STOCK" | "MARGIN_ATTENTION" | "REPEATED_PURCHASE_DEMAND"
export type OpportunityPriority = "HIGH" | "MEDIUM" | "LOW"

export interface OpportunitySignal {
  signalId: string
  type: OpportunitySignalType
  priority: OpportunityPriority
  title: string
  summary: string
  product: { id: string; name: string; sku: string | null }
  observationPeriod: { startDate: string; endDate: string; completedBusinessDates: number }
  comparisonPeriod: { startDate: string; endDate: string; completedBusinessDates: number } | null
  evidence: Record<string, string | number>
  limitations: string[]
}

export interface OpportunitySnapshot {
  schemaVersion: 1
  module: "smart_insights"
  disclaimer: string
  periods: { observation: { startDate: string; endDate: string; completedBusinessDates: number }; comparison: { startDate: string; endDate: string; completedBusinessDates: number } }
  modules: Record<string, string>
  selection: { totalSignals: number; returnedSignals: number; truncated: boolean }
  signals: OpportunitySignal[]
}

export interface AdvisorRequest { businessId: string; signalId?: string; focus?: string }
export interface AdvisorEvidence { id: string; signalId: string; label: string; value: string }
export interface AdvisorOpportunity { signalId: string; explanation: string; suggestedActions: string[]; evidenceRefs: string[]; limitations: string[]; evidence: AdvisorEvidence[] }
export interface AdvisorResponse { requestId: string; summary: string; opportunities: AdvisorOpportunity[]; overallLimitations: string[] }

export class OpportunityDataError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) { super(message); this.name = "OpportunityDataError" }
}

export function opportunityErrorMessage(code?: string, status?: number) {
  if (status === 401 || code === "UNAUTHENTICATED") return "Your session is unavailable. Sign in again and retry."
  if (status === 403 || code === "ACCESS_DENIED" || code === "MODULE_DISABLED") return "Business Opportunities are unavailable for this workspace or your role."
  if (status === 429 || code === "RATE_LIMITED") return "AI guidance request limits have been reached. Please try again later."
  if (status === 502 || code === "INVALID_PROVIDER_RESPONSE") return "AI guidance returned an unexpected response. Please try again."
  if (status === 503 || code === "AI_NOT_CONFIGURED" || code === "PROVIDER_UNAVAILABLE") return "AI guidance is temporarily unavailable. Please try again later."
  if (status === 504 || code === "PROVIDER_TIMEOUT") return "AI guidance took too long to respond. Please try again."
  return "Business Opportunities could not be loaded. Please try again."
}
