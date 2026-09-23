# AI Analyst provider boundary

Phase 10B exposes the `ai-analyst` Supabase Edge Function. It accepts only `businessId`, one supported period key, and a question of at most 800 characters. It does not accept browser-supplied metrics, roles, module state, evidence values, provider selection, or models.

## Trust and authentication

The function validates the bearer token with Supabase Auth `getUser()`, then calls `get_ai_analyst_context` through a Supabase client carrying that same caller token. No service-role key is used to retrieve business facts. A separate server-only service client may execute only the quota reservation/completion RPCs, which independently validate the authenticated user ID against active owner/manager membership and module state. Those usage RPCs are not executable by browser roles. PostgreSQL remains authoritative for tenant isolation, module state, date boundaries, calculations, and quota writes. Only context `schemaVersion: 1` is accepted.

The prompt keeps four concepts separate: immutable StockPilot grounding instructions, schema-validated deterministic context, untrusted database labels inside that JSON, and the untrusted user question. The provider receives no tools, browsing, SQL, database access, credentials, customer context, supplier contact data, or arbitrary frontend facts. Product names and SKUs remain data even if they contain instruction-like text.

Phase 10 explains and summarizes supplied facts. Forecasts, reorder quantities, opportunity recommendations, and other Phase 11 behavior are explicitly forbidden.

## Provider and response handling

`AiProvider` is the server-only seam. `OpenRouterProvider` uses `fetch`, a configured model, JSON response mode, temperature zero, an 18-second default timeout, and no retries or fallback model. `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are required at runtime; neither is a `VITE_*` variable.

For local development and testing, `OPENROUTER_MODEL=openrouter/free` is an acceptable smoke-test choice. Production model selection remains deployment configuration and is never hardcoded in browser code.

Provider JSON must contain exactly:

```json
{
  "answer": "non-empty text up to 2500 characters",
  "evidenceRefs": ["up to 8 registry IDs"],
  "limitations": ["up to 5 bounded strings"]
}
```

The model never supplies authoritative evidence values. The function builds an allowlisted registry from the current deterministic context, removes unknown or duplicate references, and hydrates the remaining label/value/period fields itself. If unknown references were removed, a deterministic limitation is added when space permits. Suggested questions are deterministic and module-aware.

When one clearly named domain is disabled, the function returns a deterministic limitation without calling the provider or consuming quota. Ambiguous or multi-domain questions go to the grounded provider because broad intent classification would be brittle.

## Quota, privacy, and operations

`reserve_ai_analyst_usage` uses transaction advisory locks before counting and inserting. Defaults are 10 requests per user in a rolling hour and 50 per business-local calendar day; a private singleton configuration row permits a reviewed server-side adjustment. Invalid, unauthenticated, unauthorized, disabled-module, insufficient-context, and missing-provider-configuration requests do not reserve quota. A reservation counts once provider invocation begins, including provider failures.

`ai_analyst_usage` stores only request ID, business ID, user ID, creation time, normalized status/error category, provider/model, nullable token counts, and nullable latency. It has RLS enabled and no direct browser table grants. Questions, prompts, context, answers, provider payloads, and API keys are never persisted. There is no conversation history or retention automation.

Logs are structured and content-free: request ID, normalized result/error, provider/model, latency, token counts, and context version. Never add questions, prompts, context, answers, raw provider errors/payloads, credentials, or customer/supplier data to logs.

Errors use `{ requestId, error: { code, message } }` with: `INVALID_REQUEST` (400), `UNAUTHENTICATED` (401), `ACCESS_DENIED`/`MODULE_DISABLED` (403), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500), `INVALID_PROVIDER_RESPONSE` (502), `AI_NOT_CONFIGURED`/`PROVIDER_UNAVAILABLE` (503), and `PROVIDER_TIMEOUT` (504).

CORS echoes only an origin in `AI_ALLOWED_ORIGINS`, permits `POST`/`OPTIONS` and the minimal Supabase request headers, sets no credential flag, and defaults only to the two local Vite origins. Configure the deployed Vercel origin explicitly.

## Local live smoke test

Automated tests use a fake provider and need no OpenRouter secret. For an optional live smoke:

1. In OpenRouter, choose a model you are authorized to use. Run `Copy-Item supabase/functions/.env.example supabase/functions/.env.local`, open only that ignored file in an editor, and set `OPENROUTER_MODEL`.
2. Paste `OPENROUTER_API_KEY` into that server-only file. Never put it in the repository-root Vite environment, a `VITE_*` variable, a command argument, terminal history, issue, PR, or chat.
3. Run `npx supabase start`, then `npx supabase db reset`. Create/sign in a disposable local owner or manager through the local app and create/select a test business.
4. In PowerShell, validate and store the test business ID without printing it: `$businessId = [Guid]::Parse((Read-Host 'Local test business UUID')).ToString()`. Enable only the local test row with `npx supabase db query --local "update public.business_modules set enabled = true where business_id = '$businessId'::uuid and module = 'ai_analyst'"`.
5. Start the server in a separate terminal: `npx supabase functions serve ai-analyst --env-file supabase/functions/.env.local`.
6. In another PowerShell terminal, set `$apiUrl = 'http://127.0.0.1:54321'`; copy the local anon key from `npx supabase status` into `$anonKey` locally (it is not the OpenRouter key); prompt for `$email = Read-Host 'Local test email'` and `$securePassword = Read-Host 'Local test password' -AsSecureString`; convert only in memory with `$plainPassword = [Net.NetworkCredential]::new('', $securePassword).Password`; then sign in without printing the token: `$session = Invoke-RestMethod -Method Post -Uri "$apiUrl/auth/v1/token?grant_type=password" -Headers @{ apikey = $anonKey } -ContentType 'application/json' -Body (@{ email = $email; password = $plainPassword } | ConvertTo-Json); $token = $session.access_token; $plainPassword = $null; $session = $null`.
7. Send one request: `$payload = @{ businessId = $businessId; period = 'THIS_MONTH'; question = 'Summarize the available business facts for this month.' } | ConvertTo-Json; $result = Invoke-RestMethod -Method Post -Uri "$apiUrl/functions/v1/ai-analyst" -Headers @{ apikey = $anonKey; Authorization = "Bearer $token" } -ContentType 'application/json' -Body $payload`.
8. Inspect only safe response metadata: `$result | Select-Object requestId, @{n='EvidenceIds';e={$_.evidence.id -join ','}}, @{n='LimitationCount';e={$_.limitations.Count}}, @{n='SuggestedQuestionCount';e={$_.suggestedQuestions.Count}}`. Function logs should contain only the request ID, normalized result, provider/model, timing/token counts, and schema version. Do not print the bearer token, request headers, prompt/context, answer, provider payload, or provider key.
9. Stop the function. Clear shell variables with `Remove-Variable token, anonKey, securePassword, email, payload, result -ErrorAction SilentlyContinue` and delete the ignored secret file with `Remove-Item -LiteralPath supabase/functions/.env.local`. If the OpenRouter key was exposed anywhere client-visible or recorded, revoke/rotate it in OpenRouter immediately and remove the exposed artifact/history.

The completed local smoke used `openrouter/free` and observed provider `openrouter`, model `openrouter/free`, context schema version `1`, a successful request, grounded answer/evidence rendering, and no browser/provider secret exposure.

Phase 10 is single-turn: no conversation history, prompt/answer persistence, background requests, or Phase 11 recommendations are included.

## Production deployment checklist

- Configure Edge Function secrets/configuration only: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, optional `OPENROUTER_BASE_URL`, `AI_PROVIDER_TIMEOUT_MS`, and the exact deployed `AI_ALLOWED_ORIGINS` value.
- Set secrets with `supabase secrets set` or the platform secret manager from a secure shell. Never expose provider secrets through `VITE_*`, frontend deployment variables, browser bundles, logs, or client requests.
- Deploy the `ai-analyst` function, verify the production origin allowlist, and smoke-test with an authorized owner/manager and an enabled `ai_analyst` module using safe response metadata only.
- Keep production model selection configurable; `openrouter/free` is for development/testing and is not a required production choice.
- Monitor only the existing content-free usage/error metadata and quota behavior. Rotate the provider key immediately if exposure is suspected.

For hosted Supabase, set secrets with `supabase secrets set` from a secure local shell and set `AI_ALLOWED_ORIGINS` to the exact deployed origin. Do not pass secrets via frontend deployment variables.
