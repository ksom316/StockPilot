import { beforeEach, describe, expect, it, vi } from "vitest"
import { askAnalyst } from "@/features/analyst/analyst-service"

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }))

const request = { businessId: "business-1", period: "THIS_MONTH" as const, question: "How were sales?" }
const response = { requestId: "request-1", answer: "Grounded answer", evidence: [], limitations: [], suggestedQuestions: [] }

describe("askAnalyst", () => {
  beforeEach(() => mocks.invoke.mockReset())

  it("invokes only the existing ai-analyst contract and validates the response", async () => {
    mocks.invoke.mockResolvedValue({ data: response, error: null })
    await expect(askAnalyst(request)).resolves.toEqual(response)
    expect(mocks.invoke).toHaveBeenCalledWith("ai-analyst", { body: request })
  })

  it("normalizes Edge error responses without exposing backend details", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "private detail" } }), { status: 429 }) },
    })
    await expect(askAnalyst(request)).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429, message: expect.stringContaining("request limits") })
    await expect(askAnalyst(request)).rejects.not.toMatchObject({ message: expect.stringContaining("private detail") })
  })
})
