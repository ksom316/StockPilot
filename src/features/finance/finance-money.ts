const amountPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/
export const maximumExpenseAmountScaled = 10n ** 19n - 1n

export function parseExpenseAmount(value: string): { value: string; scaled: bigint } | null {
  const trimmed = value.trim()
  if (!amountPattern.test(trimmed)) return null
  const [whole, fraction = ""] = trimmed.split(".")
  const scaled = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"))
  if (scaled <= 0n || scaled > maximumExpenseAmountScaled) return null
  return { value: formatExpenseAmount(scaled), scaled }
}

export function formatExpenseAmount(scaled: bigint) {
  const whole = scaled / 10_000n
  const fraction = String(scaled % 10_000n).padStart(4, "0").replace(/0+$/, "")
  return `${whole}${fraction ? `.${fraction}` : ""}`
}

export function formatExpenseMoney(value: string, currency: string) {
  return formatBusinessMoney(value, currency)
}

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}
import { formatBusinessMoney } from "@/features/business/currency"
