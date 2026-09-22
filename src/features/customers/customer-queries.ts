import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useBusiness } from "@/features/business/business-context"
import { createCustomer, fetchCustomerActivity, fetchManagedCustomers, lookupCustomers, setCustomerActive, updateCustomer } from "@/features/customers/customer-service"
import { CustomerDataError, type CustomerInput } from "@/features/customers/customer-types"

export const customerKeys = {
  directory: (businessId: string, access: "managed" | "basic") => ["customers", businessId, "directory", access] as const,
  lookup: (businessId: string) => ["customers", businessId, "lookup"] as const,
  activity: (businessId: string, customerId: string) => ["customers", businessId, "activity", customerId] as const,
}

export function useCustomers() {
  const { business, role, enabledModules } = useBusiness()
  const businessId = business?.id ?? ""
  const canManage = role === "owner" || role === "manager"
  const access = canManage ? "managed" : "basic"
  return useQuery({
    queryKey: customerKeys.directory(businessId, access),
    queryFn: () => canManage ? fetchManagedCustomers(businessId) : lookupCustomers(businessId),
    enabled: Boolean(businessId && role && enabledModules.includes("customers")),
  })
}

export function useCustomerLookup() {
  const { business, role, enabledModules } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({
    queryKey: customerKeys.lookup(businessId),
    queryFn: () => lookupCustomers(businessId),
    enabled: Boolean(businessId && role && enabledModules.includes("customers")),
  })
}

export function useCustomerActivity(customerId: string) {
  const { business, role, enabledModules } = useBusiness()
  const businessId = business?.id ?? ""
  const canView = role === "owner" || role === "manager"
  return useQuery({
    queryKey: customerKeys.activity(businessId, customerId),
    queryFn: () => fetchCustomerActivity(businessId, customerId),
    enabled: Boolean(businessId && customerId && canView && enabledModules.includes("customers")),
  })
}

export function useCustomerMutations() {
  const { business, role, enabledModules } = useBusiness()
  const queryClient = useQueryClient()
  const canManage = role === "owner" || role === "manager"
  const requireEnabledBusiness = () => {
    if (!business || !enabledModules.includes("customers")) throw new CustomerDataError("Customers is no longer enabled for this workspace. Refresh and try again.", "CUSTOMERS_DISABLED")
    return business.id
  }
  const invalidateDirectory = () => {
    if (!business) return
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customers", business.id, "directory"] }),
      queryClient.invalidateQueries({ queryKey: customerKeys.lookup(business.id) }),
    ])
  }
  const invalidateCustomer = (customerId: string) => business ? Promise.all([
    invalidateDirectory(),
    queryClient.invalidateQueries({ queryKey: customerKeys.activity(business.id, customerId) }),
  ]) : undefined
  return {
    create: useMutation({ mutationFn: (input: CustomerInput) => createCustomer(requireEnabledBusiness(), input, canManage), onSuccess: invalidateDirectory }),
    update: useMutation({ mutationFn: ({ id, input }: { id: string; input: CustomerInput }) => updateCustomer(requireEnabledBusiness(), id, input), onSuccess: (_, variables) => invalidateCustomer(variables.id) }),
    setActive: useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => setCustomerActive(requireEnabledBusiness(), id, active), onSuccess: (_, variables) => invalidateCustomer(variables.id) }),
  }
}
