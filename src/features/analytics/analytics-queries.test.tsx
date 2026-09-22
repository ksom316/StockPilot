import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"
import { analyticsKeys, useBusinessOverview } from "@/features/analytics/analytics-queries"

const service = vi.hoisted(() => ({ fetchBusinessOverview: vi.fn() }))
vi.mock("@/features/analytics/analytics-service", () => ({ fetchBusinessOverview: service.fetchBusinessOverview }))

describe("business overview query", () => {
  const range = { startDate: "2026-09-01", endDate: "2026-09-30" }
  let client: QueryClient
  let currentBusiness = testBusiness
  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}><TestBusinessProvider value={createBusinessValue({ business: currentBusiness })}>{children}</TestBusinessProvider></QueryClientProvider>
  }
  beforeEach(() => {
    service.fetchBusinessOverview.mockReset().mockImplementation(async (businessId: string) => ({ businessId }))
    currentBusiness = testBusiness
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it("keys and fetches by business plus both date boundaries", async () => {
    const { result } = renderHook(() => useBusinessOverview(range), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ businessId: testBusiness.id }))
    expect(service.fetchBusinessOverview).toHaveBeenCalledWith(testBusiness.id, range.startDate, range.endDate)
    expect(client.getQueryData(analyticsKeys.overview(testBusiness.id, range.startDate, range.endDate))).toEqual({ businessId: testBusiness.id })
  })

  it("isolates cached results when the business changes", async () => {
    const { result, rerender } = renderHook(() => useBusinessOverview(range), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ businessId: testBusiness.id }))
    currentBusiness = { ...testBusiness, id: "business-2" }
    rerender()
    await waitFor(() => expect(service.fetchBusinessOverview).toHaveBeenCalledWith("business-2", range.startDate, range.endDate))
    await waitFor(() => expect(result.current.data).toEqual({ businessId: "business-2" }))
  })

  it("does not fetch if no valid range is selected", () => {
    renderHook(() => useBusinessOverview(null), { wrapper })
    expect(service.fetchBusinessOverview).not.toHaveBeenCalled()
  })
})
