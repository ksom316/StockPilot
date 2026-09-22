import { describe, expect, it } from "vitest"
import { filterCustomers, findPossibleDuplicate } from "@/features/customers/customer-filters"
import type { BasicCustomer } from "@/features/customers/customer-types"

const customers: BasicCustomer[] = [
  { id: "1", name: "Avery Jones", phone: "+1 (555) 101-2020", email: "avery@example.com", isActive: true },
  { id: "2", name: "Morgan Lee", phone: null, email: "morgan@example.com", isActive: false },
]

describe("customer filters", () => {
  it("searches name, phone, and email and filters lifecycle state", () => {
    expect(filterCustomers(customers, "avery", "all")).toHaveLength(1)
    expect(filterCustomers(customers, "555", "active")).toHaveLength(1)
    expect(filterCustomers(customers, "morgan@example", "inactive")).toHaveLength(1)
    expect(filterCustomers(customers, "", "active")).toEqual([customers[0]])
  })

  it("warns on normalized phone or email matches without treating names as proof", () => {
    expect(findPossibleDuplicate(customers, "15551012020", "", "2")).toEqual([customers[0]])
    expect(findPossibleDuplicate(customers, "", " AVERY@EXAMPLE.COM ")).toEqual([customers[0]])
    expect(findPossibleDuplicate(customers, "", "", undefined)).toEqual([])
    expect(findPossibleDuplicate([{ ...customers[0], name: "Avery Jones 2", phone: null, email: null }], "", "")).toEqual([])
  })
})
