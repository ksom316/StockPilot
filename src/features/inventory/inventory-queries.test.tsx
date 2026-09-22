import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { describe, expect, it, vi } from "vitest"

const queryMocks = vi.hoisted(() => ({
  createCategory: vi.fn(), createProduct: vi.fn(), fetchCategories: vi.fn(), fetchProducts: vi.fn(),
  recordStockMovement: vi.fn(), updateCategory: vi.fn(), updateProduct: vi.fn(),
}))

vi.mock("@/features/inventory/inventory-service", () => queryMocks)

import { BusinessContext } from "@/features/business/business-context"
import { inventoryKeys, useInventoryMutations } from "@/features/inventory/inventory-queries"
import { createBusinessValue, testBusiness, testMembership } from "@/test/auth-test-utils"

describe("inventory movement mutation", () => {
  it("invalidates the current business product cache after success", async () => {
    queryMocks.recordStockMovement.mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined)
    function Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <BusinessContext.Provider value={createBusinessValue({ business: testBusiness, membership: testMembership, role: "owner", onboardingRequired: false })}>
            {children}
          </BusinessContext.Provider>
        </QueryClientProvider>
      )
    }

    const { result } = renderHook(() => useInventoryMutations(), { wrapper: Wrapper })
    await act(() => result.current.recordMovement.mutateAsync({ productId: "p1", movementType: "stock_in", quantity: "2", reason: null }))

    expect(queryMocks.recordStockMovement).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: inventoryKeys.products(testBusiness.id) })
  })
})
