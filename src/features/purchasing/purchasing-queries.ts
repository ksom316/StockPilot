import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useBusiness } from "@/features/business/business-context"
import { inventoryKeys } from "@/features/inventory/inventory-queries"
import { createSupplier, fetchManagedSuppliers, fetchPurchase, fetchPurchases, fetchSuppliers, recordPurchase, setSupplierActive, updateSupplier } from "@/features/purchasing/purchasing-service"
import type { RecordPurchaseInput, SupplierInput } from "@/features/purchasing/purchasing-types"
import { PurchasingDataError } from "@/features/purchasing/purchasing-types"
import { financeKeys } from "@/features/finance/finance-keys"
import { analyticsKeys } from "@/features/analytics/analytics-queries"

export const purchasingKeys = {
  suppliers: (businessId: string) => ["purchasing", businessId, "suppliers"] as const,
  supplierManagement: (businessId: string) => ["purchasing", businessId, "supplier-management"] as const,
  history: (businessId: string) => ["purchasing", businessId, "history"] as const,
  detail: (businessId: string, id: string) => ["purchasing", businessId, "purchase", id] as const,
}

export function useManagedSuppliers() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({ queryKey: purchasingKeys.supplierManagement(businessId), queryFn: () => fetchManagedSuppliers(businessId), enabled: Boolean(businessId) })
}

export function usePurchaseHistory() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({ queryKey: purchasingKeys.history(businessId), queryFn: () => fetchPurchases(businessId), enabled: Boolean(businessId) })
}

export function usePurchaseDetail(id: string) {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({ queryKey: purchasingKeys.detail(businessId, id), queryFn: () => fetchPurchase(businessId, id), enabled: Boolean(businessId && id) })
}

export function useSupplierMutations() {
  const { business } = useBusiness()
  const client = useQueryClient()
  const invalidate = () => business ? Promise.all([
    client.invalidateQueries({ queryKey: purchasingKeys.suppliers(business.id) }),
    client.invalidateQueries({ queryKey: purchasingKeys.supplierManagement(business.id) }),
  ]) : undefined
  return {
    create: useMutation({ mutationFn: (input: SupplierInput) => { if (!business) throw new PurchasingDataError("Your workspace is unavailable."); return createSupplier(business.id, input) }, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, input }: { id: string; input: SupplierInput }) => { if (!business) throw new PurchasingDataError("Your workspace is unavailable."); return updateSupplier(business.id, id, input) }, onSuccess: invalidate }),
    setActive: useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => { if (!business) throw new PurchasingDataError("Your workspace is unavailable."); return setSupplierActive(business.id, id, active) }, onSuccess: invalidate }),
  }
}

export function usePurchasingSuppliers() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({
    queryKey: purchasingKeys.suppliers(businessId),
    queryFn: () => fetchSuppliers(businessId),
    enabled: Boolean(businessId),
  })
}

export function useRecordPurchase() {
  const { business } = useBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RecordPurchaseInput) => {
      if (!business) throw new PurchasingDataError("Your workspace is unavailable. Refresh and try again.")
      return recordPurchase(input)
    },
    onSuccess: async () => {
      if (!business) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKeys.products(business.id) }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.movements(business.id) }),
        queryClient.invalidateQueries({ queryKey: purchasingKeys.history(business.id) }),
        queryClient.invalidateQueries({ queryKey: financeKeys.summaries(business.id) }),
        queryClient.invalidateQueries({ queryKey: analyticsKeys.overviews(business.id) }),
      ])
    },
  })
}
