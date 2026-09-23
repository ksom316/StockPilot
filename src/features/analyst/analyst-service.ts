import { supabase } from "@/lib/supabase"
import { AnalystDataError, analystErrorMessage, type AnalystRequest, type AnalystResponse } from "@/features/analyst/analyst-types"


function isResponse(value: unknown): value is AnalystResponse {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.requestId === "string" && typeof candidate.answer === "string" &&
    Array.isArray(candidate.evidence) && candidate.evidence.every((item) => {
      if (!item || typeof item !== "object") return false
      const evidence = item as Record<string, unknown>
      return typeof evidence.id === "string" && typeof evidence.label === "string" && typeof evidence.value === "string" && typeof evidence.period === "string"
    }) && Array.isArray(candidate.limitations) && candidate.limitations.every((item) => typeof item === "string") &&
    Array.isArray(candidate.suggestedQuestions) && candidate.suggestedQuestions.every((item) => typeof item === "string")
}

async function errorDetails(error: { context?: unknown; code?: string; message?: string }) {
  let code = error.code
  let status: number | undefined
  const context = error.context
  if (context instanceof Response) {
    status = context.status
    try {
      const body = await context.clone().json() as { error?: { code?: string } }
      code = body.error?.code ?? code
    } catch {
      // Keep the normalized fallback below.
    }
  }
  return { code, status }
}

export async function askAnalyst(input: AnalystRequest): Promise<AnalystResponse> {
  if (!supabase) throw new AnalystDataError("AI Analyst is unavailable. Refresh and try again.", "INTERNAL_ERROR")
  const { data, error } = await supabase.functions.invoke("ai-analyst", { body: input })
  if (error) {
    const details = await errorDetails(error)
    throw new AnalystDataError(analystErrorMessage(details.code, details.status), details.code, details.status)
  }
  if (!isResponse(data)) throw new AnalystDataError("AI Analyst returned an unexpected response.", "INVALID_PROVIDER_RESPONSE", 502)
  return data
}
