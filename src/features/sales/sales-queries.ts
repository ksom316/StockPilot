import { useMutation, useQueryClient } from "@tanstack/react-query"

import { useBusiness } from "@/features/business/business-context"
import { inventoryKeys } from "@/features/inventory/inventory-queries"
import { recordSale } from "@/features/sales/sales-service"
import { SalesDataError, type RecordSaleInput } from "@/features/sales/sales-types"

export function useRecordSale() {
  const { business } = useBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RecordSaleInput) => {
      if (!business) throw new SalesDataError("Your workspace is unavailable. Refresh and try again.")
      return recordSale(input)
    },
    onSuccess: async () => {
      if (!business) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKeys.products(business.id) }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.movements(business.id) }),
      ])
    },
    onError: async (error) => {
      if (business && error instanceof SalesDataError && error.code === "INSUFFICIENT_STOCK") {
        await queryClient.invalidateQueries({ queryKey: inventoryKeys.products(business.id) })
      }
    },
  })
}
