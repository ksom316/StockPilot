import { supabase } from "@/lib/supabase"
import { OpportunityDataError, opportunityErrorMessage, type AdvisorRequest, type AdvisorResponse, type OpportunitySignal, type OpportunitySnapshot } from "./opportunity-types"

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OpportunityDataError(`Business Opportunities returned an invalid ${label}.`)
  return value as Record<string, unknown>
}
function stringValue(value: unknown, label: string): string { if (typeof value !== "string") throw new OpportunityDataError(`Business Opportunities returned an invalid ${label}.`); return value }
function integer(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isInteger(value)) throw new OpportunityDataError(`Business Opportunities returned an invalid ${label}.`); return value }
function period(value: unknown, label: string) { const item = record(value, label); return { startDate: stringValue(item.startDate, `${label}.startDate`), endDate: stringValue(item.endDate, `${label}.endDate`), completedBusinessDates: integer(item.completedBusinessDates, `${label}.completedBusinessDates`) } }

function parseSignal(value: unknown): OpportunitySignal {
  const item = record(value, "signal"); const product = record(item.product, "product"); const evidence = record(item.evidence, "evidence")
  const type = stringValue(item.type, "type"); const priority = stringValue(item.priority, "priority")
  if (!["RESTOCK_DEMAND", "SALES_MOMENTUM", "SLOW_MOVING_STOCK", "MARGIN_ATTENTION", "REPEATED_PURCHASE_DEMAND"].includes(type)) throw new OpportunityDataError("Business Opportunities returned an invalid signal type.")
  if (!["HIGH", "MEDIUM", "LOW"].includes(priority)) throw new OpportunityDataError("Business Opportunities returned an invalid priority.")
  if (!Array.isArray(item.limitations) || item.limitations.some((entry) => typeof entry !== "string")) throw new OpportunityDataError("Business Opportunities returned invalid limitations.")
  const safeEvidence: Record<string, string | number> = {}
  for (const [key, entry] of Object.entries(evidence)) if (typeof entry === "string" || typeof entry === "number") safeEvidence[key] = entry
  return { signalId: stringValue(item.signalId, "signalId"), type: type as OpportunitySignal["type"], priority: priority as OpportunitySignal["priority"], title: stringValue(item.title, "title"), summary: stringValue(item.summary, "summary"), product: { id: stringValue(product.id, "product.id"), name: stringValue(product.name, "product.name"), sku: product.sku === null ? null : stringValue(product.sku, "product.sku") }, observationPeriod: period(item.observationPeriod, "observationPeriod"), comparisonPeriod: item.comparisonPeriod === null ? null : period(item.comparisonPeriod, "comparisonPeriod"), evidence: safeEvidence, limitations: item.limitations as string[] }
}

export function parseOpportunitySnapshot(value: unknown): OpportunitySnapshot {
  const item = record(value, "snapshot"); const periods = record(item.periods, "periods"); const selection = record(item.selection, "selection")
  if (item.schemaVersion !== 1 || item.module !== "smart_insights" || !Array.isArray(item.signals)) throw new OpportunityDataError("Business Opportunities returned an invalid snapshot.")
  return { schemaVersion: 1, module: "smart_insights", disclaimer: stringValue(item.disclaimer, "disclaimer"), periods: { observation: period(periods.observation, "observation"), comparison: period(periods.comparison, "comparison") }, modules: record(item.modules, "modules") as OpportunitySnapshot["modules"], selection: { totalSignals: integer(selection.totalSignals, "selection.totalSignals"), returnedSignals: integer(selection.returnedSignals, "selection.returnedSignals"), truncated: selection.truncated === true }, signals: item.signals.map(parseSignal) }
}

function parseAdvisorResponse(value: unknown): AdvisorResponse {
  const item = record(value, "advisor response")
  if (typeof item.requestId !== "string" || typeof item.summary !== "string" || !Array.isArray(item.opportunities) || !Array.isArray(item.overallLimitations)) throw new OpportunityDataError("AI guidance returned an unexpected response.", "INVALID_PROVIDER_RESPONSE", 502)
  const opportunities = item.opportunities.map((value) => { const opportunity = record(value, "advisor opportunity"); if (typeof opportunity.signalId !== "string" || typeof opportunity.explanation !== "string" || !Array.isArray(opportunity.suggestedActions) || !Array.isArray(opportunity.limitations) || !Array.isArray(opportunity.evidence) || opportunity.suggestedActions.some((x) => typeof x !== "string") || opportunity.limitations.some((x) => typeof x !== "string")) throw new OpportunityDataError("AI guidance returned an unexpected response.", "INVALID_PROVIDER_RESPONSE", 502); const evidence = opportunity.evidence.map((entry) => { const item = record(entry, "evidence"); if (typeof item.id !== "string" || typeof item.signalId !== "string" || typeof item.label !== "string" || typeof item.value !== "string") throw new OpportunityDataError("AI guidance returned an unexpected response.", "INVALID_PROVIDER_RESPONSE", 502); return item as unknown as AdvisorResponse["opportunities"][number]["evidence"][number] }); return { signalId: opportunity.signalId, explanation: opportunity.explanation, suggestedActions: opportunity.suggestedActions as string[], evidenceRefs: Array.isArray(opportunity.evidenceRefs) ? opportunity.evidenceRefs.filter((x): x is string => typeof x === "string") : [], limitations: opportunity.limitations as string[], evidence } })
  return { requestId: item.requestId, summary: item.summary, opportunities, overallLimitations: item.overallLimitations.filter((x): x is string => typeof x === "string") }
}

async function errorDetails(error: { context?: unknown; code?: string }) { let code = error.code; let status: number | undefined; if (error.context instanceof Response) { status = error.context.status; try { code = ((await error.context.clone().json()) as { error?: { code?: string } }).error?.code ?? code } catch { /* use status fallback */ } } return { code, status } }

export async function fetchOpportunitySnapshot(businessId: string) {
  if (!supabase) throw new OpportunityDataError("Business Opportunities are not configured.")
  const { data, error } = await supabase.rpc("get_business_opportunities", { p_business_id: businessId })
  if (error) throw new OpportunityDataError("We couldn't load Business Opportunities. Please try again.", error.code)
  return parseOpportunitySnapshot(data)
}

export async function getOpportunityAdvice(input: AdvisorRequest) {
  if (!supabase) throw new OpportunityDataError("AI guidance is not configured.", "INTERNAL_ERROR")
  const { data, error } = await supabase.functions.invoke("opportunity-advisor", { body: input })
  if (error) { const details = await errorDetails(error); throw new OpportunityDataError(opportunityErrorMessage(details.code, details.status), details.code, details.status) }
  return parseAdvisorResponse(data)
}
