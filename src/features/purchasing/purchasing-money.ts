import { formatMoney } from "@/features/inventory/inventory-format"
import { parseQuantity } from "@/features/inventory/inventory-decimal"

const costPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/
const costScale = 10_000n
const quantityScale = 1_000n
export const maximumPurchaseAmountScaled = 10n ** 19n - 1n
export const maximumPurchaseQuantityScaled = 10n ** 18n - 1n

export interface ParsedUnitCost {
  value: string
  scaled: bigint
}

export function parseUnitCost(value: string): ParsedUnitCost | null {
  const trimmed = value.trim()
  if (!costPattern.test(trimmed)) return null
  const [whole, fraction = ""] = trimmed.split(".")
  const scaled = BigInt(whole) * costScale + BigInt(fraction.padEnd(4, "0"))
  return { value: formatScaledCost(scaled), scaled }
}

export function calculatePurchaseLineTotal(quantity: string, unitCost: string): string | null {
  const parsedQuantity = parseQuantity(quantity)
  const parsedCost = parseUnitCost(unitCost)
  if (!parsedQuantity || !parsedCost) return null
  const rounded = (parsedQuantity.scaled * parsedCost.scaled + quantityScale / 2n) / quantityScale
  return rounded <= maximumPurchaseAmountScaled ? formatScaledCost(rounded) : null
}

export function calculatePurchaseTotal(lines: Array<{ quantity: string; unitCost: string }>): string | null {
  let total = 0n
  for (const line of lines) {
    const lineTotal = calculatePurchaseLineTotal(line.quantity, line.unitCost)
    if (lineTotal === null) return null
    const parsed = parseUnitCost(lineTotal)
    if (!parsed) return null
    total += parsed.scaled
    if (total > maximumPurchaseAmountScaled) return null
  }
  return formatScaledCost(total)
}

export function formatPurchaseMoney(value: string, currency: string) {
  return formatMoney(value, currency)
}

function formatScaledCost(value: bigint) {
  const whole = value / costScale
  const fraction = String(value % costScale).padStart(4, "0").replace(/0+$/, "")
  return `${whole}${fraction ? `.${fraction}` : ""}`
}
