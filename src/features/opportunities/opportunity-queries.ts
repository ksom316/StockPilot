import { useQuery } from "@tanstack/react-query"
import { useBusiness } from "@/features/business/business-context"
import { fetchOpportunitySnapshot } from "./opportunity-service"

export const opportunityKeys = { snapshot: (businessId: string) => ["business-opportunities", businessId] as const }
export function useOpportunitySnapshot() {
  const { business, enabledModules, role } = useBusiness(); const businessId = business?.id ?? ""
  const enabled = Boolean(businessId && enabledModules.includes("smart_insights") && ["owner", "manager"].includes(role ?? ""))
  return useQuery({ queryKey: opportunityKeys.snapshot(businessId), queryFn: () => fetchOpportunitySnapshot(businessId), enabled })
}
