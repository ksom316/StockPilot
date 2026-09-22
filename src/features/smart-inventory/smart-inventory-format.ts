function normalized(value: string) {
  const [whole = "0", fraction = ""] = value.split(".")
  return { whole: whole.replace(/^0+(?=\d)/, "") || "0", fraction }
}

function exceedsDays(value: string, limit: number) {
  const number = normalized(value)
  const limitText = String(limit)
  return number.whole.length > limitText.length || (number.whole.length === limitText.length && (number.whole > limitText || (number.whole === limitText && /[1-9]/.test(number.fraction))))
}

export function formatSmartQuantity(value: string | null) {
  if (value === null) return "Unavailable"
  const number = normalized(value)
  const fraction = number.fraction.replace(/0+$/, "")
  return fraction ? `${number.whole}.${fraction}` : number.whole
}

export function formatEstimatedDays(value: string | null) {
  if (value === null) return "Unavailable"
  if (exceedsDays(value, 365)) return "365+ days"
  const number = normalized(value)
  const first = number.fraction[0] ?? "0"
  const shouldRound = Number(number.fraction[1] ?? "0") >= 5
  let whole = BigInt(number.whole)
  let tenths = Number(first)
  if (shouldRound) {
    tenths += 1
    if (tenths === 10) {
      whole += 1n
      tenths = 0
    }
  }
  return `${whole.toString()}.${tenths} days`
}

export function formatSmartDateRange(startDate: string, endDateExclusive: string) {
  return `${startDate} through ${endDateExclusive} (end date excluded)`
}

