import { supabase } from "@/lib/supabase"
import { ReportDataError, type ReportResponse, type ReportType } from "./report-types"

const types: ReportType[] = ["inventory", "inventory_movements", "sales", "purchasing", "expenses"]
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReportDataError("The report response was invalid.", "INVALID_RESPONSE"); return value as Record<string, unknown> }
export function parseReport(value: unknown): ReportResponse {
  const row = object(value); const summary = object(row.summary); const rows = row.rows
  if (row.schemaVersion !== 1 || typeof row.businessId !== "string" || typeof row.reportType !== "string" || !types.includes(row.reportType as ReportType) || typeof row.startDate !== "string" || typeof row.endDate !== "string" || typeof row.timezone !== "string" || typeof row.page !== "number" || !Number.isInteger(row.page) || typeof row.pageSize !== "number" || !Number.isInteger(row.pageSize) || typeof row.totalRows !== "number" || !Number.isInteger(row.totalRows) || !Array.isArray(rows) || !rows.every((item) => item && typeof item === "object" && !Array.isArray(item))) throw new ReportDataError("The report response was invalid.", "INVALID_RESPONSE")
  const safeSummary = Object.fromEntries(Object.entries(summary).map(([key, item]) => [key, item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? item : null]))
  const safeRows = rows.map((item) => Object.fromEntries(Object.entries(item as Record<string, unknown>).map(([key, entry]) => [key, entry === null || typeof entry === "string" || typeof entry === "number" ? entry : null])))
  return { schemaVersion: 1, businessId: row.businessId, reportType: row.reportType as ReportType, startDate: row.startDate, endDate: row.endDate, timezone: row.timezone, page: row.page, pageSize: row.pageSize, totalRows: row.totalRows, summary: safeSummary, rows: safeRows }
}
export async function fetchReport(businessId: string, reportType: ReportType, startDate: string, endDate: string, page = 1): Promise<ReportResponse> {
  if (!supabase) throw new ReportDataError("Reports are not configured.")
  const { data, error } = await supabase.rpc("get_report", { p_business_id: businessId, p_report_type: reportType, p_start_date: startDate, p_end_date: endDate, p_page: page, p_page_size: 50 })
  if (error) throw new ReportDataError("We couldn't load this report. Please try again.", error.code)
  const parsed = parseReport(data); if (parsed.businessId !== businessId || parsed.reportType !== reportType || parsed.startDate !== startDate || parsed.endDate !== endDate) throw new ReportDataError("The report response did not match the selected workspace or period.", "SCOPE_MISMATCH")
  return parsed
}
