import { useQuery, useQueryClient } from "@tanstack/react-query"

import { useBusiness } from "@/features/business/business-context"
import { fetchSmartInventorySnapshot } from "@/features/smart-inventory/smart-inventory-service"

export const SMART_INVENTORY_PAGE_SIZE = 10

export const smartInventoryKeys = {
  snapshots: (businessId: string) => ["smart-inventory", businessId] as const,
  snapshot: (businessId: string, page: number, pageSize: number) => ["smart-inventory", businessId, "snapshot", page, pageSize] as const,
}

function smartInventoryRole(role: string | null) {
  return role === "owner" || role === "manager" || role === "employee"
}

export function useSmartInventorySnapshot(page: number, pageSize = SMART_INVENTORY_PAGE_SIZE) {
  const { business, enabledModules, role } = useBusiness()
  const businessId = business?.id ?? ""
  const enabled = Boolean(businessId && enabledModules.includes("smart_insights") && smartInventoryRole(role))
  return useQuery({
    queryKey: smartInventoryKeys.snapshot(businessId, page, pageSize),
    queryFn: () => fetchSmartInventorySnapshot(businessId, page, pageSize),
    enabled,
  })
}

export function useInvalidateSmartInventory() {
  const queryClient = useQueryClient()
  return (businessId: string) => queryClient.invalidateQueries({ queryKey: smartInventoryKeys.snapshots(businessId) })
}
