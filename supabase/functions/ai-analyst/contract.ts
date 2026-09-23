import { AnalystError } from "./errors.ts"

export const PERIODS = [
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "LAST_30_COMPLETED_DAYS",
  "CUSTOM",
] as const

export type AnalystPeriod = (typeof PERIODS)[number]

export interface AnalystRequest {
  businessId: string
  period: AnalystPeriod
  question: string
  startDate?: string
  endDate?: string
}

export interface AnalystContext {
  schemaVersion: 1
  period: Record<string, unknown> & {
    key: AnalystPeriod
    startDate: string
    endDate: string
  }
  business: Record<string, unknown> & { currency: string; timezone: string }
  modules: Record<string, unknown>
  inventory: Record<string, unknown>
  sales: Record<string, unknown>
  purchasing: Record<string, unknown>
  finance: Record<string, unknown>
  smartInventory: Record<string, unknown>
  limitations: unknown[]
}

export interface ProviderResponse {
  answer: string
  evidenceRefs: string[]
  limitations: string[]
}

export interface Evidence {
  id: string
  label: string
  value: string
  period: string
}

export interface AnalystResponse {
  requestId: string
  answer: string
  evidence: Evidence[]
  limitations: string[]
  suggestedQuestions: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const FORBIDDEN_CONTEXT_KEY = /(customer|supplier|contact|email|phone|note|description|api.?key|secret|prompt|answer)/i
const CONTEXT_KEYS = new Set([
  "schemaVersion",
  "period",
  "business",
  "modules",
  "inventory",
  "sales",
  "purchasing",
  "finance",
  "smartInventory",
  "limitations",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey)
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, child]) => FORBIDDEN_CONTEXT_KEY.test(key) || hasForbiddenKey(child),
  )
}

export function parseAnalystRequest(value: unknown): AnalystRequest {
  if (!isRecord(value)) {
    throw new AnalystError(400, "INVALID_REQUEST", "Request body must be a JSON object.")
  }
  const isCustom = value.period === "CUSTOM"
  const expected = isCustom ? ["businessId", "period", "question", "startDate", "endDate"] : ["businessId", "period", "question"]
  const keys = Object.keys(value)
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    throw new AnalystError(400, "INVALID_REQUEST", "Request body contains unsupported fields.")
  }
  if (typeof value.businessId !== "string" || !UUID.test(value.businessId)) {
    throw new AnalystError(400, "INVALID_REQUEST", "businessId must be a valid UUID.")
  }
  if (typeof value.period !== "string" || !PERIODS.includes(value.period as AnalystPeriod)) {
    throw new AnalystError(400, "INVALID_REQUEST", "period is not supported.")
  }
  if (typeof value.question !== "string") {
    throw new AnalystError(400, "INVALID_REQUEST", "question must be a string.")
  }
  if (isCustom) {
    if (typeof value.startDate !== "string" || typeof value.endDate !== "string" || !ISO_DATE.test(value.startDate) || !ISO_DATE.test(value.endDate) || value.startDate > value.endDate) {
      throw new AnalystError(400, "INVALID_REQUEST", "Custom range dates must be valid and in order.")
    }
  }
  const question = value.question.trim()
  if (question.length === 0 || question.length > 800) {
    throw new AnalystError(400, "INVALID_REQUEST", "question must contain 1 to 800 characters.")
  }
  return {
    businessId: value.businessId,
    period: value.period as AnalystPeriod,
    question,
    ...(isCustom ? { startDate: value.startDate as string, endDate: value.endDate as string } : {}),
  }
}

export function validateContext(value: unknown, expectedPeriod?: AnalystPeriod): AnalystContext {
  if (!isRecord(value) || Object.keys(value).some((key) => !CONTEXT_KEYS.has(key))) {
    throw new AnalystError(500, "INTERNAL_ERROR", "The analysis context is malformed.")
  }
  if (value.schemaVersion !== 1) {
    throw new AnalystError(500, "INTERNAL_ERROR", "The analysis context version is unsupported.")
  }
  const sections = ["period", "business", "modules", "inventory", "sales", "purchasing", "finance", "smartInventory"]
  if (sections.some((key) => !isRecord(value[key])) || !Array.isArray(value.limitations)) {
    throw new AnalystError(500, "INTERNAL_ERROR", "The analysis context is malformed.")
  }
  const period = value.period as Record<string, unknown>
  const business = value.business as Record<string, unknown>
  if (
    typeof period.key !== "string" ||
    !PERIODS.includes(period.key as AnalystPeriod) ||
    (expectedPeriod !== undefined && period.key !== expectedPeriod) ||
    typeof period.startDate !== "string" ||
    typeof period.endDate !== "string" ||
    typeof business.currency !== "string" ||
    typeof business.timezone !== "string"
  ) {
    throw new AnalystError(500, "INTERNAL_ERROR", "The analysis context is malformed.")
  }
  const availabilityValues = [value.inventory, value.sales, value.purchasing, value.finance, value.smartInventory]
    .map((section) => (section as Record<string, unknown>).availability)
  if (availabilityValues.some((state) => state !== "AVAILABLE" && state !== "MODULE_DISABLED")) {
    throw new AnalystError(500, "INTERNAL_ERROR", "The analysis context is malformed.")
  }
  if (hasForbiddenKey(value)) {
    throw new AnalystError(500, "INTERNAL_ERROR", "The analysis context contains unsupported data.")
  }
  if (JSON.stringify(value).length > 100_000) {
    throw new AnalystError(500, "INTERNAL_ERROR", "The analysis context is too large.")
  }
  return value as unknown as AnalystContext
}

function boundedStrings(value: unknown, maximum: number, itemMaximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null
  const strings: string[] = []
  for (const item of value) {
    if (typeof item !== "string") return null
    const trimmed = item.trim()
    if (trimmed.length === 0 || trimmed.length > itemMaximum) return null
    strings.push(trimmed)
  }
  return strings
}

export function validateProviderResponse(value: unknown): ProviderResponse {
  if (!isRecord(value)) {
    throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned an invalid response.")
  }
  const keys = Object.keys(value)
  const allowed = new Set(["answer", "evidenceRefs", "limitations"])
  if (keys.length !== 3 || keys.some((key) => !allowed.has(key))) {
    throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned an invalid response.")
  }
  const answer = typeof value.answer === "string" ? value.answer.trim() : ""
  const evidenceRefs = boundedStrings(value.evidenceRefs, 8, 100)
  const limitations = boundedStrings(value.limitations, 5, 300)
  if (!answer || answer.length > 2500 || evidenceRefs === null || limitations === null) {
    throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned an invalid response.")
  }
  return { answer, evidenceRefs, limitations }
}

export function availability(section: Record<string, unknown>): string {
  return typeof section.availability === "string" ? section.availability : "UNKNOWN"
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
}
