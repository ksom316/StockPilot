import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const service = vi.hoisted(() => ({ fetchManagedCustomers: vi.fn(), lookupCustomers: vi.fn(), createCustomer: vi.fn(), updateCustomer: vi.fn(), setCustomerActive: vi.fn() }))
vi.mock("@/features/customers/customer-service", () => service)

import { customerKeys, useCustomerMutations, useCustomers } from "@/features/customers/customer-queries"
import { TestBusinessProvider, createBusinessValue, testBusiness } from "@/test/auth-test-utils"

describe("customer queries", () => {
  let client: QueryClient
  beforeEach(() => {
    vi.clearAllMocks()
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    service.fetchManagedCustomers.mockResolvedValue([{ id: "c1", name: "Avery", phone: null, email: null, note: "Private", isActive: true, createdAt: "now", updatedAt: "now" }])
    service.lookupCustomers.mockResolvedValue([{ id: "c1", name: "Avery", phone: null, email: null, isActive: true }])
    service.createCustomer.mockResolvedValue(undefined)
    service.updateCustomer.mockResolvedValue(undefined)
    service.setCustomerActive.mockResolvedValue(undefined)
  })

  function makeWrapper(value: ReturnType<typeof createBusinessValue>) {
    return function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}><TestBusinessProvider value={value}>{children}</TestBusinessProvider></QueryClientProvider>
    }
  }

  it.each(["owner", "manager"] as const)("uses rich query path for %s", async (role) => {
    const value = createBusinessValue({ business: testBusiness, role, enabledModules: ["customers"] })
    const { result } = renderHook(() => useCustomers(), { wrapper: makeWrapper(value) })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(service.fetchManagedCustomers).toHaveBeenCalledWith(testBusiness.id)
    expect(service.lookupCustomers).not.toHaveBeenCalled()
    expect(client.getQueryData(customerKeys.directory(testBusiness.id, "managed"))).toBeDefined()
  })

  it.each(["employee", "cashier"] as const)("uses basic RPC path for %s", async (role) => {
    const value = createBusinessValue({ business: testBusiness, role, enabledModules: ["customers"] })
    const { result } = renderHook(() => useCustomers(), { wrapper: makeWrapper(value) })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(service.lookupCustomers).toHaveBeenCalledWith(testBusiness.id)
    expect(service.fetchManagedCustomers).not.toHaveBeenCalled()
    expect(client.getQueryData(customerKeys.directory(testBusiness.id, "basic"))).toBeDefined()
  })

  it("uses a fresh tenant key when the business changes", async () => {
    let value = createBusinessValue({ business: testBusiness, role: "owner", enabledModules: ["customers"] })
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}><TestBusinessProvider value={value}>{children}</TestBusinessProvider></QueryClientProvider>
    const { rerender } = renderHook(() => useCustomers(), { wrapper })
    await waitFor(() => expect(client.getQueryData(customerKeys.directory("business-1", "managed"))).toBeDefined())
    value = createBusinessValue({ business: { ...testBusiness, id: "business-2" }, role: "owner", enabledModules: ["customers"] })
    rerender()
    await waitFor(() => expect(service.fetchManagedCustomers).toHaveBeenCalledWith("business-2"))
    expect(client.getQueryData(customerKeys.directory("business-2", "managed"))).toBeDefined()
    expect(customerKeys.directory("business-1", "managed")).not.toEqual(customerKeys.directory("business-2", "managed"))
  })

  it("invalidates only the current business customer directory after lifecycle changes", async () => {
    const spy = vi.spyOn(client, "invalidateQueries")
    const value = createBusinessValue({ business: testBusiness, role: "manager", enabledModules: ["customers"] })
    const { result } = renderHook(() => useCustomerMutations(), { wrapper: makeWrapper(value) })
    await act(async () => { await result.current.setActive.mutateAsync({ id: "c1", active: false }) })
    expect(spy).toHaveBeenCalledWith({ queryKey: ["customers", testBusiness.id, "directory"] })
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: expect.arrayContaining(["finance"]) }))
    expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: expect.arrayContaining(["sales"]) }))
  })

  it("does not fetch when Customers is disabled", () => {
    const value = createBusinessValue({ business: testBusiness, role: "owner", enabledModules: [] })
    const { result } = renderHook(() => useCustomers(), { wrapper: makeWrapper(value) })
    expect(result.current.fetchStatus).toBe("idle")
    expect(service.fetchManagedCustomers).not.toHaveBeenCalled()
  })

  it("fails customer mutations locally when Customers is disabled", async () => {
    const value = createBusinessValue({ business: testBusiness, role: "owner", enabledModules: [] })
    const { result } = renderHook(() => useCustomerMutations(), { wrapper: makeWrapper(value) })
    await act(async () => { await expect(result.current.create.mutateAsync({ name: "Avery", phone: null, email: null, note: null })).rejects.toThrow(/no longer enabled/i) })
    expect(service.createCustomer).not.toHaveBeenCalled()
  })
})
