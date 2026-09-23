import { createClient } from "npm:@supabase/supabase-js@2.116.0"
import { AnalystError } from "./errors.ts"
import { createAnalystHandler, mapContextError, type AnalystDependencies, type CompletionMetadata } from "./handler.ts"
import { OpenRouterProvider } from "./provider.ts"
import { buildContextRpcArgs, type AnalystPeriod } from "./contract.ts"

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

function callerClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

function usageClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new AnalystError(500, "INTERNAL_ERROR", "Usage service is unavailable.")
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const provider = new OpenRouterProvider({
  apiKey: Deno.env.get("OPENROUTER_API_KEY"),
  model: Deno.env.get("OPENROUTER_MODEL"),
  baseUrl: Deno.env.get("OPENROUTER_BASE_URL"),
  timeoutMs: Number(Deno.env.get("AI_PROVIDER_TIMEOUT_MS") ?? "18000"),
})

const dependencies: AnalystDependencies = {
  provider,
  async authenticate(token: string) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new AnalystError(500, "INTERNAL_ERROR", "Authentication service is unavailable.")
    }
    const { data, error } = await callerClient(token).auth.getUser(token)
    if (error || !data.user) {
      throw new AnalystError(401, "UNAUTHENTICATED", "Authentication is required.")
    }
    return data.user.id
  },
  async getContext(token: string, businessId: string, period: AnalystPeriod, startDate?: string, endDate?: string) {
    const { data, error } = await callerClient(token).rpc("get_ai_analyst_context", buildContextRpcArgs(businessId, period, startDate, endDate))
    if (error) throw mapContextError(error)
    return data
  },
  async reserveQuota(userId: string, businessId: string, requestId: string) {
    const { data, error } = await usageClient().rpc("reserve_ai_analyst_usage", {
      p_business_id: businessId,
      p_request_id: requestId,
      p_user_id: userId,
    })
    if (error) throw mapContextError(error)
    if (data !== "RESERVED" && data !== "USER_HOURLY_LIMIT" && data !== "BUSINESS_DAILY_LIMIT") {
      throw new AnalystError(500, "INTERNAL_ERROR", "AI quota could not be reserved.")
    }
    return data
  },
  async completeUsage(userId: string, requestId: string, metadata: CompletionMetadata) {
    const { data, error } = await usageClient().rpc("complete_ai_analyst_usage", {
      p_request_id: requestId,
      p_user_id: userId,
      p_status: metadata.status,
      p_error_category: metadata.errorCategory,
      p_provider: metadata.provider,
      p_model: metadata.model,
      p_input_tokens: metadata.inputTokens,
      p_output_tokens: metadata.outputTokens,
      p_latency_ms: metadata.latencyMs,
    })
    if (error || data !== true) throw new Error("usage completion failed")
  },
  log(event: Record<string, unknown>) {
    console.log(JSON.stringify(event))
  },
}

const allowedOrigins = new Set(
  (Deno.env.get("AI_ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
)

Deno.serve(createAnalystHandler(dependencies, allowedOrigins))
