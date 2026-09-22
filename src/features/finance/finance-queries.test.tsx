import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"
import { financeKeys } from "@/features/finance/finance-keys"
import { useFinancialSummary } from "@/features/finance/finance-queries"

const service = vi.hoisted(() => ({ fetchFinancialSummary: vi.fn() }))
vi.mock("@/features/finance/finance-service", () => ({
  fetchFinancialSummary: service.fetchFinancialSummary,
  createExpense: vi.fn(), createExpenseCategory: vi.fn(), fetchExpenseAudit: vi.fn(), fetchExpenseCategories: vi.fn(), fetchExpenses: vi.fn(), updateExpense: vi.fn(), updateExpenseCategory: vi.fn(), voidExpense: vi.fn(),
}))

describe("financial summary query", () => {
  const range = { startDate: "2026-09-01", endDate: "2026-09-30" }
  let client: QueryClient
  let currentBusiness = testBusiness
  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}><TestBusinessProvider value={createBusinessValue({ business: currentBusiness })}>{children}</TestBusinessProvider></QueryClientProvider>
  }

  beforeEach(() => {
    service.fetchFinancialSummary.mockReset().mockResolvedValue({ recordedSales: "1.0000" })
    currentBusiness = testBusiness
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it("keys by business and date range and refreshes against the newly selected business", async () => {
    const { result, rerender } = renderHook(() => useFinancialSummary(range), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ recordedSales: "1.0000" }))
    expect(service.fetchFinancialSummary).toHaveBeenCalledWith(testBusiness.id, range.startDate, range.endDate)
    expect(client.getQueryData(financeKeys.summary(testBusiness.id, range.startDate, range.endDate))).toEqual({ recordedSales: "1.0000" })

    currentBusiness = { ...testBusiness, id: "business-2" }
    rerender()
    await waitFor(() => expect(service.fetchFinancialSummary).toHaveBeenCalledWith("business-2", range.startDate, range.endDate))
  })
})
