import { formatMoney } from "@/features/inventory/inventory-format"
import { parseQuantity } from "@/features/inventory/inventory-decimal"

const pricePattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/
const priceScale = 10_000n
const quantityScale = 1_000n
const maximumSaleAmountScaled = 10n ** 19n - 1n

export interface ParsedSalePrice {
  value: string
  scaled: bigint
}

export function parseSalePrice(value: string): ParsedSalePrice | null {
  const trimmed = value.trim()
  if (!pricePattern.test(trimmed)) return null
  const [whole, fraction = ""] = trimmed.split(".")
  const scaled = BigInt(whole) * priceScale + BigInt(fraction.padEnd(4, "0"))
  return { value: formatScaledMoney(scaled), scaled }
}

export function calculateSaleLineTotal(quantity: string, unitPrice: string): string | null {
  const parsedQuantity = parseQuantity(quantity)
  const parsedPrice = parseSalePrice(unitPrice)
  if (!parsedQuantity || !parsedPrice) return null
  const product = parsedQuantity.scaled * parsedPrice.scaled
  const rounded = (product + quantityScale / 2n) / quantityScale
  return rounded <= maximumSaleAmountScaled ? formatScaledMoney(rounded) : null
}

export function calculateSaleTotal(lines: Array<{ quantity: string; unitPrice: string }>): string | null {
  let total = 0n
  for (const line of lines) {
    const lineTotal = calculateSaleLineTotal(line.quantity, line.unitPrice)
    if (lineTotal === null) return null
    const parsed = parseSalePrice(lineTotal)
    if (!parsed) return null
    total += parsed.scaled
    if (total > maximumSaleAmountScaled) return null
  }
  return formatScaledMoney(total)
}

export function formatSaleMoney(value: string, currency: string) {
  return formatMoney(value, currency)
}

function formatScaledMoney(value: bigint) {
  const whole = value / priceScale
  const fraction = String(value % priceScale).padStart(4, "0").replace(/0+$/, "")
  return `${whole}${fraction ? `.${fraction}` : ""}`
}
