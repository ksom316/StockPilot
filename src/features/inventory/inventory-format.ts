export type StockState = "In stock" | "Low stock" | "Out of stock"

function normalizeDecimal(value: string | number) {
  const [wholePart = "0", fractionPart = ""] = String(value).split(".")
  return { whole: wholePart.replace(/^0+(?=\d)/, ""), fraction: fractionPart.replace(/0+$/, "") }
}

function compareNonNegativeDecimals(left: string | number, right: string | number) {
  const a = normalizeDecimal(left)
  const b = normalizeDecimal(right)
  if (a.whole.length !== b.whole.length) return a.whole.length > b.whole.length ? 1 : -1
  if (a.whole !== b.whole) return a.whole > b.whole ? 1 : -1
  const length = Math.max(a.fraction.length, b.fraction.length)
  const aFraction = a.fraction.padEnd(length, "0")
  const bFraction = b.fraction.padEnd(length, "0")
  return aFraction === bFraction ? 0 : aFraction > bFraction ? 1 : -1
}

export function getStockState(quantity: string | number, threshold: string | number | null): StockState {
  if (compareNonNegativeDecimals(quantity, 0) === 0) return "Out of stock"
  if (threshold === null) return "In stock"
  if (compareNonNegativeDecimals(quantity, threshold) <= 0) return "Low stock"
  return "In stock"
}

export function formatQuantity(value: string | number) {
  const normalized = normalizeDecimal(value)
  return normalized.fraction ? `${normalized.whole}.${normalized.fraction}` : normalized.whole
}

export function formatMoney(value: string | number, currency: string) {
  const normalized = normalizeDecimal(value)
  const fraction = normalized.fraction.slice(0, 4).replace(/0+$/, "").padEnd(2, "0")
  const parts = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(BigInt(normalized.whole))
  let lastNumberPart = -1
  parts.forEach((part, index) => {
    if (part.type === "integer" || part.type === "group") lastNumberPart = index
  })
  const decimalSeparator = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1 }).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? "."
  parts.splice(lastNumberPart + 1, 0, { type: "decimal", value: decimalSeparator }, { type: "fraction", value: fraction })
  return parts.map((part) => part.value).join("")
}
