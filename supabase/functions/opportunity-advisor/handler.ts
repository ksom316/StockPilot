import { AnalystError, asAnalystError, type ErrorCode } from "../ai-analyst/errors.ts"
import { buildOpportunityEvidence, boundedAdvisorContext, hydrateOpportunityEvidence, signalById } from "./evidence.ts"
import { buildOpportunityProviderInput } from "./grounding.ts"
import { parseAdvisorRequest, validateOpportunityContext, validateProviderResponse, type AdvisorResponse } from "./contract.ts"
import type { AiProvider, AnalystProviderResult } from "../ai-analyst/provider.ts"

export interface AdvisorCompletionMetadata { status: "succeeded" | "failed"; errorCategory: ErrorCode | null; provider: string | null; model: string | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number | null }
export interface AdvisorDependencies { provider: AiProvider; authenticate(token: string): Promise<string>; getOpportunities(token: string, businessId: string): Promise<unknown>; reserveQuota(userId: string, businessId: string, requestId: string): Promise<"RESERVED" | "USER_HOURLY_LIMIT" | "BUSINESS_DAILY_LIMIT">; completeUsage(userId: string, requestId: string, metadata: AdvisorCompletionMetadata): Promise<void>; log(event: Record<string, unknown>): void }
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" }
function cors(origin: string | null, allowed: Set<string>): Record<string, string> { return origin && allowed.has(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" } : {} }
function json(status: number, body: unknown, extra: Record<string, string>) { return new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } }) }
function token(request: Request): string { const match = request.headers.get("Authorization")?.match(/^Bearer\s+([^\s]+)$/i); if (!match) throw new AnalystError(401, "UNAUTHENTICATED", "Authentication is required."); return match[1] }
function failure(error: AnalystError, result?: AnalystProviderResult): AdvisorCompletionMetadata { const categories: ErrorCode[] = ["INVALID_PROVIDER_RESPONSE", "PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "INTERNAL_ERROR"]; return { status: "failed", errorCategory: categories.includes(error.code) ? error.code : "INTERNAL_ERROR", provider: result?.provider ?? "openrouter", model: result?.model ?? null, inputTokens: result?.usage.inputTokens ?? null, outputTokens: result?.usage.outputTokens ?? null, latencyMs: result?.latencyMs ?? null } }

export function createOpportunityAdvisorHandler(dependencies: AdvisorDependencies, allowedOrigins: Set<string>) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID(); const origin = request.headers.get("Origin"); const allowedCors = cors(origin, allowedOrigins)
    if (request.method === "OPTIONS") return origin && !allowedOrigins.has(origin) ? new Response(null, { status: 403 }) : new Response(null, { status: 204, headers: allowedCors })
    if (origin && !allowedOrigins.has(origin)) return json(403, { requestId, error: { code: "ACCESS_DENIED", message: "Origin is not allowed." } }, allowedCors)
    let userId: string | null = null; let reserved = false; let providerResult: AnalystProviderResult | undefined
    try {
      if (request.method !== "POST") throw new AnalystError(400, "INVALID_REQUEST", "Only POST requests are supported.")
      let body: unknown; try { body = await request.json() } catch { throw new AnalystError(400, "INVALID_REQUEST", "Request body must be valid JSON.") }
      const input = parseAdvisorRequest(body); const authToken = token(request); userId = await dependencies.authenticate(authToken)
      const context = validateOpportunityContext(await dependencies.getOpportunities(authToken, input.businessId))
      if (input.signalId && !signalById(context, input.signalId)) throw new AnalystError(400, "INVALID_REQUEST", "signalId is not present in deterministic opportunities.")
      const bounded = boundedAdvisorContext(context, input.signalId); const registry = buildOpportunityEvidence(bounded)
      dependencies.provider.assertConfigured()
      const reservation = await dependencies.reserveQuota(userId, input.businessId, requestId)
      if (reservation !== "RESERVED") throw new AnalystError(429, "RATE_LIMITED", "AI Opportunity Advisor request limit reached. Try again later.")
      reserved = true
      providerResult = await dependencies.provider.analyze(buildOpportunityProviderInput(bounded, input.focus, [...registry.keys()]))
      const providerResponse = validateProviderResponse(providerResult.response)
      const returned = new Set<string>()
      const opportunities = providerResponse.opportunities.map((opportunity) => {
        if (returned.has(opportunity.signalId)) throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned a duplicate opportunity signal.")
        returned.add(opportunity.signalId)
        if (!signalById(bounded, opportunity.signalId)) throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned an unknown opportunity signal.")
        try { return { ...opportunity, evidence: hydrateOpportunityEvidence(opportunity.evidenceRefs, opportunity.signalId, registry) } }
        catch { throw new AnalystError(502, "INVALID_PROVIDER_RESPONSE", "The AI provider returned an unsupported evidence reference.") }
      }).sort((left, right) => bounded.signals.findIndex((signal) => signal.signalId === left.signalId) - bounded.signals.findIndex((signal) => signal.signalId === right.signalId))
      await dependencies.completeUsage(userId, requestId, { status: "succeeded", errorCategory: null, provider: providerResult.provider, model: providerResult.model, inputTokens: providerResult.usage.inputTokens, outputTokens: providerResult.usage.outputTokens, latencyMs: providerResult.latencyMs })
      const response: AdvisorResponse = { requestId, summary: providerResponse.summary, opportunities, overallLimitations: providerResponse.overallLimitations }
      dependencies.log({ requestId, result: "succeeded", provider: providerResult.provider, model: providerResult.model, latencyMs: providerResult.latencyMs, inputTokens: providerResult.usage.inputTokens, outputTokens: providerResult.usage.outputTokens })
      return json(200, response, allowedCors)
    } catch (caught) {
      const error = asAnalystError(caught)
      if (reserved && userId) { try { await dependencies.completeUsage(userId, requestId, failure(error, providerResult)) } catch { dependencies.log({ requestId, result: "usage_completion_failed" }) } }
      dependencies.log({ requestId, result: "failed", errorCategory: error.code })
      return json(error.status, { requestId, error: { code: error.code, message: error.message } }, allowedCors)
    }
  }
}
export function mapOpportunityContextError(error: { code?: string; message?: string }): AnalystError {
  if (error.code === "42501" && error.message === "Smart Insights is not enabled for this business") return new AnalystError(403, "MODULE_DISABLED", "Smart Insights is not enabled for this business.")
  if (error.code === "42501") return new AnalystError(403, "ACCESS_DENIED", "You do not have access to Business Opportunities for this business.")
  return new AnalystError(500, "INTERNAL_ERROR", "The opportunity context could not be loaded.")
}
