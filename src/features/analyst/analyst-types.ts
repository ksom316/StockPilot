export const analystPeriods = ["TODAY", "THIS_WEEK", "THIS_MONTH", "LAST_30_COMPLETED_DAYS", "CUSTOM"] as const
export type AnalystPeriod = (typeof analystPeriods)[number]

export interface AnalystRequest {
  businessId: string
  period: AnalystPeriod
  question: string
  startDate?: string
  endDate?: string
}

export interface AnalystEvidence {
  id: string
  label: string
  value: string
  period: string
}

export interface AnalystResponse {
  requestId: string
  answer: string
  evidence: AnalystEvidence[]
  limitations: string[]
  suggestedQuestions: string[]
}

export class AnalystDataError extends Error {
  constructor(message: string, public readonly code?: string, public readonly status?: number) {
    super(message)
    this.name = "AnalystDataError"
  }
}

export function analystErrorMessage(code?: string, status?: number) {
  if (status === 400 || code === "INVALID_REQUEST") return "Check the question and selected period, then try again."
  if (status === 401 || code === "UNAUTHENTICATED") return "Your session is unavailable. Sign in again and retry."
  if (status === 403 || code === "ACCESS_DENIED" || code === "MODULE_DISABLED") return "AI Analyst is unavailable for this workspace or your role."
  if (status === 429 || code === "RATE_LIMITED") return "AI Analyst request limits have been reached. Please try again later."
  if (status === 502 || code === "INVALID_PROVIDER_RESPONSE") return "The AI Analyst response was unavailable. Please try again."
  if (status === 503 || code === "AI_NOT_CONFIGURED" || code === "PROVIDER_UNAVAILABLE") return "AI Analyst is temporarily unavailable. Please try again later."
  if (status === 504 || code === "PROVIDER_TIMEOUT") return "AI Analyst took too long to respond. Please try again."
  return "AI Analyst could not complete that request. Please try again."
}
