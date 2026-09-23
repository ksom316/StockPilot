import { useQuery } from "@tanstack/react-query"
import { useBusiness } from "@/features/business/business-context"
import type { AnalyticsDateRange } from "@/features/analytics/analytics-period"
import { fetchAnalyticsWorkspace } from "@/features/analytics/analytics-workspace-service"

export const analyticsWorkspaceKeys = {
  workspace: (businessId: string, startDate: string, endDate: string) => ["analytics", businessId, "workspace", startDate, endDate] as const,
}

export function useAnalyticsWorkspace(range: AnalyticsDateRange | null) {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({
    queryKey: analyticsWorkspaceKeys.workspace(businessId, range?.startDate ?? "", range?.endDate ?? ""),
    queryFn: () => fetchAnalyticsWorkspace(businessId, range!.startDate, range!.endDate),
    enabled: Boolean(businessId && range),
  })
}
