import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }))
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } } }))

import { fetchOpportunitySnapshot, getOpportunityAdvice, parseOpportunitySnapshot } from "./opportunity-service"

const signal = { signalId: "RESTOCK_DEMAND:20000000-0000-4000-8000-000000000001", type: "RESTOCK_DEMAND", priority: "HIGH", title: "Review replenishment", summary: "Recorded demand is present.", product: { id: "20000000-0000-4000-8000-000000000001", name: "Item", sku: "SKU-1" }, observationPeriod: { startDate: "2026-08-01", endDate: "2026-08-30", completedBusinessDates: 30 }, comparisonPeriod: null, evidence: { recordedSalesQuantity: "6.000" }, limitations: ["Not a prediction."] }
const snapshot = { schemaVersion: 1, module: "smart_insights", disclaimer: "Recorded data only.", periods: { observation: { startDate: "2026-08-01", endDate: "2026-08-30", completedBusinessDates: 30 }, comparison: { startDate: "2026-07-02", endDate: "2026-07-31", completedBusinessDates: 30 } }, modules: { sales: "AVAILABLE" }, selection: { totalSignals: 1, returnedSignals: 1, truncated: false }, signals: [signal] }

describe("opportunity service", () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.invoke.mockReset() })
  it("preserves deterministic priority and exact evidence strings", () => { expect(parseOpportunitySnapshot(snapshot).signals[0]).toMatchObject({ priority: "HIGH", evidence: { recordedSalesQuantity: "6.000" } }) })
  it("uses the Phase 11A RPC and Phase 11B function contracts", async () => { mocks.rpc.mockResolvedValue({ data: snapshot, error: null }); mocks.invoke.mockResolvedValue({ data: { requestId: "r1", summary: "Grounded", opportunities: [], overallLimitations: [] }, error: null }); await fetchOpportunitySnapshot("business-1"); await getOpportunityAdvice({ businessId: "business-1", signalId: signal.signalId }); expect(mocks.rpc).toHaveBeenCalledWith("get_business_opportunities", { p_business_id: "business-1" }); expect(mocks.invoke).toHaveBeenCalledWith("opportunity-advisor", { body: { businessId: "business-1", signalId: signal.signalId } }) })
  it("normalizes representative quota errors", async () => { mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), { status: 429 }) } }); await expect(getOpportunityAdvice({ businessId: "business-1" })).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429, message: expect.stringContaining("limits") }) })
})
