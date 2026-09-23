import { isValidIsoDate } from "@/features/finance/finance-money"
import { getDateInTimezone, maximumFinanceRangeDays } from "@/features/finance/finance-period"

export type AnalyticsPeriod = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "last_30" | "last_90" | "custom"
export interface AnalyticsDateRange { startDate: string; endDate: string }

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function startOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`
}

function endOfMonth(value: string) {
  const [year, month] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function isValidCustomRange(startDate: string, endDate: string, today: string) {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || startDate > endDate || endDate > today) return false
  const elapsed = (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000
  return elapsed < maximumFinanceRangeDays
}

export function getAnalyticsDateRange(period: AnalyticsPeriod, timezone: string, now = new Date(), customStart = "", customEnd = ""): AnalyticsDateRange | null {
  const today = getDateInTimezone(now, timezone)
  if (!today) return null
  if (period === "custom") return isValidCustomRange(customStart, customEnd, today) ? { startDate: customStart, endDate: customEnd } : null
  if (period === "today") return { startDate: today, endDate: today }
  if (period === "yesterday") {
    const yesterday = shiftDate(today, -1)
    return { startDate: yesterday, endDate: yesterday }
  }
  if (period === "last_30") return { startDate: shiftDate(today, -30), endDate: shiftDate(today, -1) }
  if (period === "last_90") return { startDate: shiftDate(today, -90), endDate: shiftDate(today, -1) }

  const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  const monday = shiftDate(today, -daysSinceMonday)
  if (period === "week") return { startDate: monday, endDate: today }
  if (period === "last_week") {
    const lastMonday = shiftDate(monday, -7)
    return { startDate: lastMonday, endDate: shiftDate(monday, -1) }
  }
  if (period === "month") return { startDate: startOfMonth(today), endDate: today }
  const previousMonthEnd = shiftDate(startOfMonth(today), -1)
  return { startDate: startOfMonth(previousMonthEnd), endDate: endOfMonth(previousMonthEnd) }
}
