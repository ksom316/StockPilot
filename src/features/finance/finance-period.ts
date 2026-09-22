import { isValidIsoDate } from "@/features/finance/finance-money"

export type FinancePeriod = "today" | "week" | "month" | "custom"
export interface FinanceDateRange { startDate: string; endDate: string }
export const maximumFinanceRangeDays = 366

export function isWithinFinanceRangeLimit(startDate: string, endDate: string) {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || startDate > endDate) return false
  const start = Date.parse(`${startDate}T00:00:00.000Z`)
  const end = Date.parse(`${endDate}T00:00:00.000Z`)
  return (end - start) / 86_400_000 < maximumFinanceRangeDays
}

export function getDateInTimezone(date: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return null
  }
}

export function getFinanceDateRange(period: FinancePeriod, timezone: string, now = new Date(), customStart = "", customEnd = ""): FinanceDateRange | null {
  if (period === "custom") {
    if (!isWithinFinanceRangeLimit(customStart, customEnd)) return null
    return { startDate: customStart, endDate: customEnd }
  }
  const today = getDateInTimezone(now, timezone)
  if (!today) return null
  if (period === "today") return { startDate: today, endDate: today }
  const [year, month, day] = today.split("-").map(Number)
  if (period === "month") {
    const monthText = String(month).padStart(2, "0")
    const lastDay = String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")
    return { startDate: `${year}-${monthText}-01`, endDate: `${year}-${monthText}-${lastDay}` }
  }
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  const monday = new Date(Date.UTC(year, month - 1, day - daysSinceMonday))
  const sunday = new Date(Date.UTC(year, month - 1, day + (6 - daysSinceMonday)))
  return { startDate: monday.toISOString().slice(0, 10), endDate: sunday.toISOString().slice(0, 10) }
}
