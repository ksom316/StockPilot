import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { inventoryKeys } from "@/features/inventory/inventory-queries"
import { financeKeys } from "@/features/finance/finance-keys"
import { analyticsKeys } from "@/features/analytics/analytics-queries"
import { purchasingKeys, useRecordPurchase } from "@/features/purchasing/purchasing-queries"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const recordPurchaseMock = vi.hoisted(() => vi.fn())
vi.mock("@/features/purchasing/purchasing-service", () => ({ recordPurchase: recordPurchaseMock, fetchSuppliers: vi.fn() }))

describe("useRecordPurchase", () => {
  let client: QueryClient
  let invalidate: ReturnType<typeof vi.spyOn>

  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}><TestBusinessProvider value={createBusinessValue({ business: testBusiness })}>{children}</TestBusinessProvider></QueryClientProvider>
  }

  beforeEach(() => {
    recordPurchaseMock.mockReset()
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue()
  })

  it("invalidates this business's product, movement, and purchase-history queries", async () => {
    recordPurchaseMock.mockResolvedValue({ id: "purchase-1", purchase_reference: "PUR-000001" })
    const { result } = renderHook(() => useRecordPurchase(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ items: [], requestId: "r1", supplierId: null, notes: null })
    })
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(5))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: inventoryKeys.products(testBusiness.id) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: inventoryKeys.movements(testBusiness.id) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: purchasingKeys.history(testBusiness.id) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: financeKeys.summaries(testBusiness.id) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: analyticsKeys.overviews(testBusiness.id) })
  })
})
