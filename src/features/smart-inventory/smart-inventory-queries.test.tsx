import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceMocks = vi.hoisted(() => ({ fetchSmartInventorySnapshot: vi.fn() }))
vi.mock("@/features/smart-inventory/smart-inventory-service", () => serviceMocks)

import { BusinessContext } from "@/features/business/business-context"
import { smartInventoryKeys, useInvalidateSmartInventory, useSmartInventorySnapshot } from "@/features/smart-inventory/smart-inventory-queries"
import { createBusinessValue, testBusiness, testMembership } from "@/test/auth-test-utils"

describe("Smart Inventory queries", () => {
  beforeEach(() => vi.clearAllMocks())

  it("uses business/page/page-size keys and fetches only for an allowed enabled role", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    serviceMocks.fetchSmartInventorySnapshot.mockResolvedValue({ products: [] })
    function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}><BusinessContext.Provider value={createBusinessValue({ business: testBusiness, membership: testMembership, role: "employee", enabledModules: ["smart_insights"], onboardingRequired: false })}>{children}</BusinessContext.Provider></QueryClientProvider>
    }
    const { result } = renderHook(() => useSmartInventorySnapshot(2, 10), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(serviceMocks.fetchSmartInventorySnapshot).toHaveBeenCalledWith(testBusiness.id, 2, 10)
    expect(client.getQueryData(smartInventoryKeys.snapshot(testBusiness.id, 2, 10))).toEqual({ products: [] })
  })

  it("does not query for cashiers or when Smart Inventory is disabled", () => {
    const client = new QueryClient()
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}><BusinessContext.Provider value={createBusinessValue({ business: testBusiness, role: "cashier", enabledModules: [], onboardingRequired: false })}>{children}</BusinessContext.Provider></QueryClientProvider>
    const { result } = renderHook(() => useSmartInventorySnapshot(1), { wrapper })
    expect(result.current.fetchStatus).toBe("idle")
    expect(serviceMocks.fetchSmartInventorySnapshot).not.toHaveBeenCalled()
  })

  it("invalidates every page for the current business only", async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined)
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useInvalidateSmartInventory(), { wrapper })
    await act(() => result.current(testBusiness.id))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: smartInventoryKeys.snapshots(testBusiness.id) })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: smartInventoryKeys.snapshots("business-2") })
  })
})
