import { AnalystError } from "../ai-analyst/errors.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SIGNAL_ID = /^[A-Z_]+:[0-9a-f-]{36}$/i

export interface AdvisorRequest { businessId: string; signalId?: string; focus?: string }
export interface OpportunitySignal {
  signalId: string
  type: string
  priority: string
  title: string
  summary: string
  product: { id: string; name: string; sku: string | null }
  observationPeriod: Record<string, unknown>
  comparisonPeriod: Record<string, unknown> | null
  evidence: Record<string, unknown>
  limitations: string[]
}
export interface OpportunityContext {
  schemaVersion: number
  module: "smart_insights"
  disclaimer: string
  periods: Record<string, unknown>
  modules: Record<string, unknown>
  selection: Record<string, unknown>
  signals: OpportunitySignal[]
}
export interface AdvisorEvidence { id: string; signalId: string; label: string; value: string }
export interface AdvisorOpportunity {
  signalId: string
  explanation: string
  suggestedActions: string[]
  evidenceRefs: string[]
  limitations: string[]
}
export interface AdvisorResponse {
  requestId: string
  summary: string
  opportunities: Array<AdvisorOpportunity & { evidence: AdvisorEvidence[] }>
  overallLimitations: string[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function strings(value: unknown, max: number, itemMax: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0 || item.trim().length > itemMax) return null
    result.push(item.trim())
  }
  return result
}

export function parseAdvisorRequest(value: unknown): AdvisorRequest {
  if (!record(value)) throw new AnalystError(400, "INVALID_REQUEST", "Request body must be a JSON object.")
  const keys = Object.keys(value)
  if (keys.some((key) => !["businessId", "signalId", "focus"].includes(key))) {
    throw new AnalystError(400, "INVALID_REQUEST", "Request body contains unsupported fields.")
  }
  if (typeof value.businessId !== "string" || !UUID.test(value.businessId)) {
    throw new AnalystError(400, "INVALID_REQUEST", "businessId must be a valid UUID.")
  }
  if (value.signalId !== undefined && (typeof value.signalId !== "string" || !SIGNAL_ID.test(value.signalId))) {
    throw new AnalystError(400, "INVALID_REQUEST", "signalId is invalid.")
  }
  if (value.focus !== undefined && (typeof value.focus !== "string" || value.focus.trim().length === 0 || value.focus.trim().length > 500)) {
    throw new AnalystError(400, "INVALID_REQUEST", "focus must contain 1 to 500 characters.")
  }
  return { businessId: value.businessId, signalId: value.signalId, focus: typeof value.focus === "string" ? value.focus.trim() : undefined }
}

function safeText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null
}

function hasPrivateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPrivateKey)
  if (!record(value)) return false
  return Object.entries(value).some(([key, child]) => /(customer|supplier|contact|email|phone|note|description|secret|api.?key|token|password|prompt|answer)/i.test(key) || hasPrivateKey(child))
}

export function validateOpportunityContext(value: unknown): OpportunityContext {
  if (!record(value) || value.schemaVersion !== 1 || value.module !== "smart_insights" || !Array.isArray(value.signals)) {
    throw new AnalystError(500, "INTERNAL_ERROR", "The opportunity context is malformed.")
  }
  if (value.signals.length > 100 || JSON.stringify(value).length > 100_000 || hasPrivateKey(value)) throw new AnalystError(500, "INTERNAL_ERROR", "The opportunity context contains unsupported data.")
  const signals: OpportunitySignal[] = []
  for (const raw of value.signals) {
    if (!record(raw) || typeof raw.signalId !== "string" || !SIGNAL_ID.test(raw.signalId) || typeof raw.type !== "string" ||
      typeof raw.priority !== "string" || safeText(raw.title, 300) === null || safeText(raw.summary, 500) === null ||
      !record(raw.product) || typeof raw.product.id !== "string" || typeof raw.product.name !== "string" ||
      (raw.product.sku !== null && typeof raw.product.sku !== "string") || !record(raw.evidence) ||
      !record(raw.observationPeriod) || (raw.comparisonPeriod !== null && !record(raw.comparisonPeriod)) ||
      strings(raw.limitations, 5, 300) === null) {
      throw new AnalystError(500, "INTERNAL_ERROR", "The opportunity context is malformed.")
    }
    signals.push({ signalId: raw.signalId, type: raw.type, priority: raw.priority, title: raw.title.trim(), summary: raw.summary.trim(),
      product: { id: raw.product.id, name: raw.product.name, sku: raw.product.sku }, observationPeriod: raw.observationPeriod,
      comparisonPeriod: raw.comparisonPeriod, evidence: raw.evidence, limitations: strings(raw.limitations, 5, 300) as string[] })
  }
  return { schemaVersion: 1, module: "smart_insights", disclaimer: typeof value.disclaimer === "string" ? value.disclaimer : "",
    periods: record(value.periods) ? value.periods : {}, modules: record(value.modules) ? value.modules : {},
    selection: record(value.selection) ? value.selection : {}, signals }
}

export interface ProviderAdvisorResponse { summary: string; opportunities: AdvisorOpportunity[]; overallLimitations: string[] }
export function validateProviderResponse(value: unknown): ProviderAdvisorResponse {
  if (!record(value) || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["summary", "opportunities", "overallLimitations"].includes(key))) {
    throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned an invalid response.")
  }
  const summary = safeText(value.summary, 1500)
  const overallLimitations = strings(value.overallLimitations, 5, 300)
  if (!summary || overallLimitations === null || !Array.isArray(value.opportunities) || value.opportunities.length > 10) {
    throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned an invalid response.")
  }
  const opportunities: AdvisorOpportunity[] = []
  for (const item of value.opportunities) {
    if (!record(item) || typeof item.signalId !== "string" || !SIGNAL_ID.test(item.signalId) || safeText(item.explanation, 1200) === null ||
      strings(item.suggestedActions, 3, 300) === null || strings(item.evidenceRefs, 8, 120) === null || strings(item.limitations, 4, 300) === null) {
      throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned an invalid response.")
    }
    opportunities.push({ signalId: item.signalId, explanation: item.explanation.trim(), suggestedActions: strings(item.suggestedActions, 3, 300) as string[],
      evidenceRefs: strings(item.evidenceRefs, 8, 120) as string[], limitations: strings(item.limitations, 4, 300) as string[] })
  }
  return { summary, opportunities, overallLimitations }
}
