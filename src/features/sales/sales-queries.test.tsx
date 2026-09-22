import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { inventoryKeys } from "@/features/inventory/inventory-queries"
import { financeKeys } from "@/features/finance/finance-keys"
import { salesKeys, useRecordSale } from "@/features/sales/sales-queries"
import { customerKeys } from "@/features/customers/customer-queries"
import { SalesDataError } from "@/features/sales/sales-types"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const recordSaleMock = vi.hoisted(() => vi.fn())
vi.mock("@/features/sales/sales-service", () => ({ recordSale: recordSaleMock }))

describe("useRecordSale", () => {
  let client: QueryClient
  let invalidate: ReturnType<typeof vi.spyOn>

  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}><TestBusinessProvider value={createBusinessValue({ business: testBusiness })}>{children}</TestBusinessProvider></QueryClientProvider>
  }

  beforeEach(() => {
    recordSaleMock.mockReset()
    client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue()
  })

  it("refreshes products and movement history after a sale", async () => {
    recordSaleMock.mockResolvedValue({ id: "sale-1", sale_reference: "S-1" })
    const { result } = renderHook(() => useRecordSale(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ items: [{ product_id: "p1", quantity: "1", unit_price: "2.50" }], notes: null })
    })

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(5))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: salesKeys.list(testBusiness.id) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: salesKeys.detail(testBusiness.id, "sale-1") })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: inventoryKeys.products(testBusiness.id) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: inventoryKeys.movements(testBusiness.id) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: financeKeys.summaries(testBusiness.id) })
  })

  it("invalidates only the linked customer's activity query after a customer sale", async () => {
    recordSaleMock.mockResolvedValue({ id: "sale-2", sale_reference: "S-2", customerId: "customer-1" })
    const { result } = renderHook(() => useRecordSale(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ items: [{ product_id: "p1", quantity: "1", unit_price: "2.50" }], notes: null, customerId: "customer-1" })
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: customerKeys.activity(testBusiness.id, "customer-1") })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["customers"] })
  })

  it("refreshes products after an insufficient-stock rejection", async () => {
    recordSaleMock.mockRejectedValue(new SalesDataError("Insufficient stock", "INSUFFICIENT_STOCK"))
    const { result } = renderHook(() => useRecordSale(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({ items: [{ product_id: "p1", quantity: "1", unit_price: "2.50" }], notes: null })).rejects.toThrow("Insufficient stock")
    })

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: inventoryKeys.products(testBusiness.id) })
  })
})
