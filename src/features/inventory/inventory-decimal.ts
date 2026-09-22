const quantityPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/
const scale = 1000n

export interface ParsedQuantity {
  value: string
  scaled: bigint
}

export function parseQuantity(value: string): ParsedQuantity | null {
  const trimmed = value.trim()
  if (!quantityPattern.test(trimmed)) return null
  const [whole, fraction = ""] = trimmed.split(".")
  const scaled = BigInt(whole) * scale + BigInt(fraction.padEnd(3, "0"))
  return { value: formatScaledQuantity(scaled), scaled }
}

export function parseDatabaseQuantity(value: string | number): ParsedQuantity {
  const parsed = parseQuantity(String(value))
  if (!parsed) throw new Error("Invalid database quantity")
  return parsed
}

export function formatScaledQuantity(value: bigint) {
  const sign = value < 0n ? "-" : ""
  const absolute = value < 0n ? -value : value
  const whole = absolute / scale
  const fraction = String(absolute % scale).padStart(3, "0").replace(/0+$/, "")
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`
}

export function resultingQuantity(current: string | number, signedDelta: bigint) {
  return parseDatabaseQuantity(current).scaled + signedDelta
}
