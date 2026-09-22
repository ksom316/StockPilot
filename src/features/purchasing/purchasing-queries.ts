import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useBusiness } from "@/features/business/business-context"
import { inventoryKeys } from "@/features/inventory/inventory-queries"
import { fetchSuppliers, recordPurchase } from "@/features/purchasing/purchasing-service"
import type { RecordPurchaseInput } from "@/features/purchasing/purchasing-types"
import { PurchasingDataError } from "@/features/purchasing/purchasing-types"

export const purchasingKeys = {
  suppliers: (businessId: string) => ["purchasing", businessId, "suppliers"] as const,
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
      ])
    },
  })
}
