import type { BasicCustomer } from "@/features/customers/customer-types"

export type CustomerStatusFilter = "active" | "inactive" | "all"

export function filterCustomers<T extends BasicCustomer>(customers: T[], term: string, status: CustomerStatusFilter) {
  const normalized = term.trim().toLocaleLowerCase()
  return customers.filter((customer) => {
    const matchesStatus = status === "all" || (status === "active" ? customer.isActive : !customer.isActive)
    const matchesTerm = !normalized || [customer.name, customer.phone, customer.email]
      .some((value) => value?.toLocaleLowerCase().includes(normalized))
    return matchesStatus && matchesTerm
  })
}

export function findPossibleDuplicate<T extends BasicCustomer>(customers: T[], phone: string, email: string, excludeId?: string) {
  const normalizedPhone = normalizePhone(phone)
  const normalizedEmail = email.trim().toLocaleLowerCase()
  if (!normalizedPhone && !normalizedEmail) return []
  return customers.filter((customer) => {
    if (customer.id === excludeId) return false
    return Boolean(
      (normalizedPhone && normalizePhone(customer.phone ?? "") === normalizedPhone)
      || (normalizedEmail && customer.email?.trim().toLocaleLowerCase() === normalizedEmail),
    )
  })
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "")
}
