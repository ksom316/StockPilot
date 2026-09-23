export const currencyOptions = [
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
] as const

export type BusinessCurrency = (typeof currencyOptions)[number]["code"]
export const defaultBusinessCurrency: BusinessCurrency = "USD"
export function isBusinessCurrency(value: string): value is BusinessCurrency { return currencyOptions.some((item) => item.code === value) }
export function currencyLabel(code: string) { return currencyOptions.find((item) => item.code === code)?.name ?? code }

/** Formats exact decimal strings without converting them through Number. */
export function formatBusinessMoney(value: string | number, currency: string) {
  const [wholePart = "0", fractionPart = ""] = String(value).split(".")
  const whole = wholePart.replace(/^0+(?=\d)/, "")
  const fraction = fractionPart.slice(0, 4).replace(/0+$/, "").padEnd(2, "0")
  const parts = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).formatToParts(BigInt(whole))
  let lastNumberPart = -1
  parts.forEach((part, index) => { if (part.type === "integer" || part.type === "group") lastNumberPart = index })
  const decimalSeparator = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1 }).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? "."
  parts.splice(lastNumberPart + 1, 0, { type: "decimal", value: decimalSeparator }, { type: "fraction", value: fraction })
  return parts.map((part) => part.value).join("")
}
