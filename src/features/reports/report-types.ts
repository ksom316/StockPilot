export type ReportType = "inventory" | "inventory_movements" | "sales" | "purchasing" | "expenses"
export interface ReportResponse { schemaVersion: 1; businessId: string; reportType: ReportType; startDate: string; endDate: string; timezone: string; page: number; pageSize: number; totalRows: number; summary: Record<string, string | number | boolean | null>; rows: Array<Record<string, string | number | null>> }
export class ReportDataError extends Error { constructor(message: string, public readonly code?: string) { super(message) } }
