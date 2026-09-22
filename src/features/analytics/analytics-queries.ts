import { useQuery } from "@tanstack/react-query"
import { useBusiness } from "@/features/business/business-context"
import type { FinanceDateRange } from "@/features/finance/finance-period"
import { fetchBusinessOverview } from "@/features/analytics/analytics-service"

export const analyticsKeys = {
  overview: (businessId: string, startDate: string, endDate: string) => ["analytics", businessId, "overview", startDate, endDate] as const,
  overviews: (businessId: string) => ["analytics", businessId, "overview"] as const,
}

export function useBusinessOverview(range: FinanceDateRange | null) {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  const startDate = range?.startDate ?? ""
  const endDate = range?.endDate ?? ""
  return useQuery({
    queryKey: analyticsKeys.overview(businessId, startDate, endDate),
    queryFn: () => fetchBusinessOverview(businessId, startDate, endDate),
    enabled: Boolean(businessId && range),
  })
}
