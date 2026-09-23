# Business Opportunity Advisor (Phase 11B)

The `opportunity-advisor` Edge Function is an explicit, authenticated explanation layer over `get_business_opportunities(...)`. Phase 11A remains authoritative for signal existence, evidence, priority, ordering, and deterministic observation periods.

The function reuses the Phase 10 `OpenRouterProvider`, normalized AI errors, and `reserve_ai_analyst_usage` / `complete_ai_analyst_usage` quota ledger. Sharing the quota is intentional: both features are user-requested AI work with the same server-side provider and cost controls.

The provider receives only a bounded deterministic signal context and an optional focus. Product labels and focus are untrusted text. The response can explain existing signals and suggest up to three cautious review actions, but cannot create signals, calculate authoritative metrics, or make guaranteed outcome claims. Evidence references are allowlisted and hydrated from the deterministic context after provider validation. Logs contain request/result metadata only, never prompts, context, answers, or provider bodies.
