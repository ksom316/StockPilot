import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useBusiness } from "@/features/business/business-context"
import { inventoryKeys } from "@/features/inventory/inventory-queries"
import { fetchSale, fetchSales, recordSale } from "@/features/sales/sales-service"
import { SalesDataError, type RecordSaleInput } from "@/features/sales/sales-types"
import { financeKeys } from "@/features/finance/finance-keys"
import { customerKeys } from "@/features/customers/customer-queries"
import { analyticsKeys } from "@/features/analytics/analytics-queries"
import { smartInventoryKeys } from "@/features/smart-inventory/smart-inventory-queries"

export const salesKeys = {
  list: (businessId: string) => ["sales", businessId, "list"] as const,
  detail: (businessId: string, saleId: string) => ["sales", businessId, "detail", saleId] as const,
}

export function useSalesHistory() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({
    queryKey: salesKeys.list(businessId),
    queryFn: () => fetchSales(businessId),
    enabled: Boolean(businessId),
  })
}

export function useSaleDetail(saleId: string) {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({
    queryKey: salesKeys.detail(businessId, saleId),
    queryFn: () => fetchSale(businessId, saleId),
    enabled: Boolean(businessId && saleId),
  })
}

export function useRecordSale() {
  const { business } = useBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RecordSaleInput) => {
      if (!business) throw new SalesDataError("Your workspace is unavailable. Refresh and try again.")
      return recordSale(input)
    },
    onSuccess: async (recorded) => {
      if (!business) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.list(business.id) }),
        queryClient.invalidateQueries({ queryKey: salesKeys.detail(business.id, recorded.id) }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.products(business.id) }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.movements(business.id) }),
        queryClient.invalidateQueries({ queryKey: financeKeys.summaries(business.id) }),
        queryClient.invalidateQueries({ queryKey: analyticsKeys.overviews(business.id) }),
        queryClient.invalidateQueries({ queryKey: smartInventoryKeys.snapshots(business.id) }),
        ...(recorded.customerId ? [queryClient.invalidateQueries({ queryKey: customerKeys.activity(business.id, recorded.customerId) })] : []),
      ])
    },
    onError: async (error) => {
      if (business && error instanceof SalesDataError && error.code === "INSUFFICIENT_STOCK") {
        await queryClient.invalidateQueries({ queryKey: inventoryKeys.products(business.id) })
      }
    },
  })
}
