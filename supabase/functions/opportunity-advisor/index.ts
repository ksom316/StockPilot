import { createClient } from "npm:@supabase/supabase-js@2.116.0"
import { AnalystError } from "../ai-analyst/errors.ts"
import { OpenRouterProvider } from "../ai-analyst/provider.ts"
import { createOpportunityAdvisorHandler, mapOpportunityContextError, type AdvisorDependencies } from "./handler.ts"
const url = Deno.env.get("SUPABASE_URL") ?? ""; const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? ""; const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
function caller(token: string) { return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } }) }
function usage() { if (!url || !service) throw new AnalystError(500, "INTERNAL_ERROR", "Usage service is unavailable."); return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) }
const provider = new OpenRouterProvider({ apiKey: Deno.env.get("OPENROUTER_API_KEY"), model: Deno.env.get("OPENROUTER_MODEL"), baseUrl: Deno.env.get("OPENROUTER_BASE_URL"), timeoutMs: Number(Deno.env.get("AI_PROVIDER_TIMEOUT_MS") ?? "18000") })
const dependencies: AdvisorDependencies = {
  provider,
  async authenticate(token) { if (!url || !anon) throw new AnalystError(500, "INTERNAL_ERROR", "Authentication service is unavailable."); const { data, error } = await caller(token).auth.getUser(token); if (error || !data.user) throw new AnalystError(401, "UNAUTHENTICATED", "Authentication is required."); return data.user.id },
  async getOpportunities(token, businessId) { const { data, error } = await caller(token).rpc("get_business_opportunities", { p_business_id: businessId }); if (error) throw mapOpportunityContextError(error); return data },
  async reserveQuota(userId, businessId, requestId) { const { data, error } = await usage().rpc("reserve_ai_analyst_usage", { p_business_id: businessId, p_request_id: requestId, p_user_id: userId }); if (error || !["RESERVED", "USER_HOURLY_LIMIT", "BUSINESS_DAILY_LIMIT"].includes(data)) throw new AnalystError(500, "INTERNAL_ERROR", "AI quota could not be reserved."); return data },
  async completeUsage(userId, requestId, metadata) { const { data, error } = await usage().rpc("complete_ai_analyst_usage", { p_request_id: requestId, p_user_id: userId, p_status: metadata.status, p_error_category: metadata.errorCategory, p_provider: metadata.provider, p_model: metadata.model, p_input_tokens: metadata.inputTokens, p_output_tokens: metadata.outputTokens, p_latency_ms: metadata.latencyMs }); if (error || data !== true) throw new Error("usage completion failed") },
  log(event) { console.log(JSON.stringify(event)) },
}
const allowedOrigins = new Set((Deno.env.get("AI_ALLOWED_ORIGINS") ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map((origin) => origin.trim()).filter(Boolean))
Deno.serve(createOpportunityAdvisorHandler(dependencies, allowedOrigins))
