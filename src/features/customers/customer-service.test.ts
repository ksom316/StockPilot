import { beforeEach, describe, expect, it, vi } from "vitest"

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }))
vi.mock("@/lib/supabase", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }))

import { createCustomer, fetchManagedCustomers, lookupCustomers, setCustomerActive, updateCustomer } from "@/features/customers/customer-service"

describe("customer service privacy and boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.from.mockReturnValue({ select: mock.select })
    mock.select.mockReturnValue({ eq: mock.eq })
    mock.eq.mockReturnValue({ order: mock.order })
  })

  it("uses the rich table boundary only for owner/manager data and scopes it by business", async () => {
    mock.order.mockResolvedValue({ data: [{ id: "c1", name: "Avery", phone: null, email: "a@example.com", note: "Private", is_active: true, created_at: "created", updated_at: "updated" }], error: null })
    await expect(fetchManagedCustomers("b1")).resolves.toEqual([{ id: "c1", name: "Avery", phone: null, email: "a@example.com", note: "Private", isActive: true, createdAt: "created", updatedAt: "updated" }])
    expect(mock.from).toHaveBeenCalledWith("customers")
    expect(mock.select).toHaveBeenCalledWith("id,name,phone,email,note,is_active,created_at,updated_at")
    expect(mock.eq).toHaveBeenCalledWith("business_id", "b1")
  })

  it("uses only the basic lookup RPC for employee/cashier data", async () => {
    mock.rpc.mockResolvedValue({ data: [{ id: "c1", name: "Avery", phone: null, email: "a@example.com", is_active: true }], error: null })
    await expect(lookupCustomers("b2")).resolves.toEqual([{ id: "c1", name: "Avery", phone: null, email: "a@example.com", isActive: true }])
    expect(mock.rpc).toHaveBeenCalledWith("lookup_customers", { p_business_id: "b2" })
    expect(mock.from).not.toHaveBeenCalled()
  })

  it("omits note entirely from employee/cashier create payloads", async () => {
    mock.rpc.mockResolvedValue({ data: "customer-1", error: null })
    await expect(createCustomer("b1", { name: "Avery", phone: null, email: null, note: "must not travel" }, false)).resolves.toBe("customer-1")
    expect(mock.rpc).toHaveBeenCalledWith("create_customer", { p_business_id: "b1", p_name: "Avery", p_phone: null, p_email: null })
  })

  it("includes note only for a manager create and uses dedicated update/lifecycle RPCs", async () => {
    mock.rpc.mockResolvedValue({ data: "customer-1", error: null })
    await createCustomer("b1", { name: "Avery", phone: null, email: null, note: "Private" }, true)
    expect(mock.rpc).toHaveBeenNthCalledWith(1, "create_customer", { p_business_id: "b1", p_name: "Avery", p_phone: null, p_email: null, p_note: "Private" })
    await updateCustomer("b1", "c1", { name: "Avery 2", phone: "555", email: null, note: "Private" })
    expect(mock.rpc).toHaveBeenNthCalledWith(2, "update_customer", { p_business_id: "b1", p_customer_id: "c1", p_name: "Avery 2", p_phone: "555", p_email: null, p_note: "Private" })
    await setCustomerActive("b1", "c1", false)
    expect(mock.rpc).toHaveBeenNthCalledWith(3, "set_customer_active", { p_business_id: "b1", p_customer_id: "c1", p_is_active: false })
  })
})
