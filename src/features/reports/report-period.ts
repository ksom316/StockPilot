import { isValidIsoDate } from "@/features/finance/finance-money"
import { getDateInTimezone } from "@/features/finance/finance-period"

export type ReportPeriodPreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "last_30_days" | "last_90_days" | "custom"
export interface ReportDateRange { startDate: string; endDate: string }
export const maximumReportRangeDays = 366

function shift(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10) }
function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate() }
export function getReportDateRange(preset: ReportPeriodPreset, timezone: string, now = new Date(), customStart = "", customEnd = ""): ReportDateRange | null {
  const today = getDateInTimezone(now, timezone)
  if (!today) return null
  if (preset === "custom") return isValidIsoDate(customStart) && isValidIsoDate(customEnd) && customStart <= customEnd && customEnd <= today && (Date.parse(`${customEnd}T00:00:00Z`) - Date.parse(`${customStart}T00:00:00Z`)) / 86_400_000 < maximumReportRangeDays ? { startDate: customStart, endDate: customEnd } : null
  if (preset === "today") return { startDate: today, endDate: today }
  if (preset === "yesterday") return { startDate: shift(today, -1), endDate: shift(today, -1) }
  if (preset === "last_30_days") return { startDate: shift(today, -29), endDate: today }
  if (preset === "last_90_days") return { startDate: shift(today, -89), endDate: today }
  const [year, month, day] = today.split("-").map(Number)
  const first = `${year}-${String(month).padStart(2, "0")}-01`
  if (preset === "this_month") return { startDate: first, endDate: today }
  const previousMonth = month === 1 ? 12 : month - 1; const previousYear = month === 1 ? year - 1 : year
  const previousLast = `${previousYear}-${String(previousMonth).padStart(2, "0")}-${daysInMonth(previousYear, previousMonth)}`
  if (preset === "last_month") return { startDate: `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`, endDate: previousLast }
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); const monday = shift(today, -(weekday + 6) % 7)
  if (preset === "this_week") return { startDate: monday, endDate: today }
  const lastMonday = shift(monday, -7)
  return { startDate: lastMonday, endDate: shift(lastMonday, 6) }
}
