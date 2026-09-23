import { useQuery } from "@tanstack/react-query"
import { useBusiness } from "@/features/business/business-context"
import { fetchReport } from "./report-service"
import type { ReportDateRange } from "./report-period"
import type { ReportType } from "./report-types"
export const reportKeys = { report: (businessId: string, type: ReportType, range: ReportDateRange | null, page: number) => ["reports", businessId, type, range?.startDate ?? "", range?.endDate ?? "", page] as const }
export function useReport(type: ReportType, range: ReportDateRange | null, enabled: boolean, page: number) { const { business } = useBusiness(); const businessId = business?.id ?? ""; return useQuery({ queryKey: reportKeys.report(businessId, type, range, page), queryFn: () => fetchReport(businessId, type, range!.startDate, range!.endDate, page), enabled: Boolean(businessId && range && enabled) }) }
