import {
  parseAnalystRequest,
  validateContext,
  validateProviderResponse,
  type AnalystPeriod,
  type AnalystResponse,
  type ProviderResponse,
} from "./contract.ts"
import { buildEvidenceRegistry, hydrateEvidence, suggestedQuestions, unavailableDomainResponse } from "./evidence.ts"
import { AnalystError, asAnalystError, type ErrorCode, type ProviderDiagnostics } from "./errors.ts"
import { buildProviderInput } from "./grounding.ts"
import type { AiProvider, AnalystProviderResult } from "./provider.ts"

export interface CompletionMetadata {
  status: "succeeded" | "failed"
  errorCategory: ErrorCode | null
  provider: string | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number | null
}

export interface AnalystDependencies {
  provider: AiProvider
  authenticate(token: string): Promise<string>
  getContext(token: string, businessId: string, period: AnalystPeriod, startDate?: string, endDate?: string): Promise<unknown>
  reserveQuota(userId: string, businessId: string, requestId: string): Promise<"RESERVED" | "USER_HOURLY_LIMIT" | "BUSINESS_DAILY_LIMIT">
  completeUsage(userId: string, requestId: string, metadata: CompletionMetadata): Promise<void>
  log(event: Record<string, unknown>): void
}

const BASE_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" }

function corsHeaders(origin: string | null, allowedOrigins: Set<string>): Record<string, string> {
  if (!origin || !allowedOrigins.has(origin)) return {}
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...cors } })
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization")
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)
  if (!match) throw new AnalystError(401, "UNAUTHENTICATED", "Authentication is required.")
  return match[1]
}

function failureMetadata(error: AnalystError, result?: AnalystProviderResult): CompletionMetadata {
  const allowed: ErrorCode[] = ["INVALID_PROVIDER_RESPONSE", "PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "INTERNAL_ERROR"]
  return {
    status: "failed",
    errorCategory: allowed.includes(error.code) ? error.code : "INTERNAL_ERROR",
    provider: result?.provider ?? "openrouter",
    model: result?.model ?? null,
    inputTokens: result?.usage.inputTokens ?? null,
    outputTokens: result?.usage.outputTokens ?? null,
    latencyMs: result?.latencyMs ?? null,
  }
}

function failureDiagnostics(error: AnalystError, result?: AnalystProviderResult): ProviderDiagnostics | undefined {
  if (error.code !== "INVALID_PROVIDER_RESPONSE") return undefined
  return {
    ...(result?.diagnostics ?? {}),
    ...(error.diagnostics ?? {}),
  }
}

export function createAnalystHandler(
  dependencies: AnalystDependencies,
  allowedOrigins: Set<string>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID()
    const origin = request.headers.get("Origin")
    const cors = corsHeaders(origin, allowedOrigins)
    if (request.method === "OPTIONS") {
      if (origin && !allowedOrigins.has(origin)) return new Response(null, { status: 403 })
      return new Response(null, { status: 204, headers: cors })
    }
    if (origin && !allowedOrigins.has(origin)) {
      return json(403, { requestId, error: { code: "ACCESS_DENIED", message: "Origin is not allowed." } }, cors)
    }

    let userId: string | null = null
    let quotaReserved = false
    let providerResult: AnalystProviderResult | undefined
    try {
      if (request.method !== "POST") {
        throw new AnalystError(400, "INVALID_REQUEST", "Only POST requests are supported.")
      }
      let body: unknown
      try {
        body = await request.json()
      } catch {
        throw new AnalystError(400, "INVALID_REQUEST", "Request body must be valid JSON.")
      }
      const input = parseAnalystRequest(body)
      const token = bearerToken(request)
      userId = await dependencies.authenticate(token)
      const context = validateContext(
        await dependencies.getContext(token, input.businessId, input.period, input.startDate, input.endDate),
        input.period,
      )
      const registry = buildEvidenceRegistry(context)
      const deterministic = unavailableDomainResponse(context, input.question)
      if (deterministic) {
        const response: AnalystResponse = {
          requestId,
          answer: deterministic.answer,
          evidence: [],
          limitations: deterministic.limitations,
          suggestedQuestions: suggestedQuestions(context),
        }
        dependencies.log({ requestId, result: "deterministic_limitation", contextSchemaVersion: 1 })
        return json(200, response, cors)
      }

      dependencies.provider.assertConfigured()
      const reservation = await dependencies.reserveQuota(userId, input.businessId, requestId)
      if (reservation !== "RESERVED") {
        throw new AnalystError(429, "RATE_LIMITED", "AI Analyst request limit reached. Try again later.")
      }
      quotaReserved = true
      providerResult = await dependencies.provider.analyze(
        buildProviderInput(context, input.question, [...registry.keys()]),
      )
      let providerResponse: ProviderResponse
      try {
        providerResponse = validateProviderResponse(providerResult.response)
      } catch (caught) {
        const error = asAnalystError(caught)
        if (error.code === "INVALID_PROVIDER_RESPONSE") {
          throw new AnalystError(error.status, error.code, error.message, {
            ...(providerResult.diagnostics ?? {}),
            failureStage: "schema_invalid",
          })
        }
        throw caught
      }
      const hydrated = hydrateEvidence(providerResponse.evidenceRefs, registry)
      const limitations = [...providerResponse.limitations]
      if (hydrated.removedUnknown && limitations.length < 5) {
        limitations.push("One or more unsupported evidence references were omitted.")
      }
      await dependencies.completeUsage(userId, requestId, {
        status: "succeeded",
        errorCategory: null,
        provider: providerResult.provider,
        model: providerResult.model,
        inputTokens: providerResult.usage.inputTokens,
        outputTokens: providerResult.usage.outputTokens,
        latencyMs: providerResult.latencyMs,
      })
      const response: AnalystResponse = {
        requestId,
        answer: providerResponse.answer,
        evidence: hydrated.evidence,
        limitations,
        suggestedQuestions: suggestedQuestions(context),
      }
      dependencies.log({
        requestId,
        result: "succeeded",
        provider: providerResult.provider,
        model: providerResult.model,
        latencyMs: providerResult.latencyMs,
        inputTokens: providerResult.usage.inputTokens,
        outputTokens: providerResult.usage.outputTokens,
        contextSchemaVersion: 1,
      })
      return json(200, response, cors)
    } catch (caught) {
      const error = asAnalystError(caught)
      if (quotaReserved && userId) {
        try {
          await dependencies.completeUsage(userId, requestId, failureMetadata(error, providerResult))
        } catch {
          dependencies.log({ requestId, result: "usage_completion_failed" })
        }
      }
      dependencies.log({
        requestId,
        result: "failed",
        errorCategory: error.code,
        ...failureDiagnostics(error, providerResult),
      })
      return json(error.status, { requestId, error: { code: error.code, message: error.message } }, cors)
    }
  }
}

export function mapContextError(error: { code?: string; message?: string }): AnalystError {
  if (error.code === "42501" && error.message === "AI Analyst is not enabled for this business") {
    return new AnalystError(403, "MODULE_DISABLED", "AI Analyst is not enabled for this business.")
  }
  if (error.code === "42501") {
    return new AnalystError(403, "ACCESS_DENIED", "You do not have access to AI Analyst for this business.")
  }
  if (error.code === "22023") return new AnalystError(400, "INVALID_REQUEST", "The selected custom range is invalid.")
  return new AnalystError(500, "INTERNAL_ERROR", "The analysis context could not be loaded.")
}
