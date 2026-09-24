import { formatScaledQuantity, parseQuantity } from "@/features/inventory/inventory-decimal"
import { parseUnitCost } from "@/features/purchasing/purchasing-money"

const quantityScale = 1_000n
const costScale = 10_000n

export function convertPurchaseQuantity(purchaseQuantity: string, unitsPerPurchaseUnit: string): string | null {
  const quantity = parseQuantity(purchaseQuantity)
  const conversion = parseQuantity(unitsPerPurchaseUnit)
  if (!quantity || !conversion || conversion.scaled <= 0n) return null

  const product = quantity.scaled * conversion.scaled
  if (product % quantityScale !== 0n) return null
  return formatScaledQuantity(product / quantityScale)
}

export function calculateBaseUnitCost(purchaseUnitCost: string, unitsPerPurchaseUnit: string): string | null {
  const cost = parseUnitCost(purchaseUnitCost)
  const conversion = parseQuantity(unitsPerPurchaseUnit)
  if (!cost || !conversion || conversion.scaled <= 0n) return null

  const numerator = cost.scaled * quantityScale
  const rounded = (numerator + conversion.scaled / 2n) / conversion.scaled
  if (rounded >= 10n ** 19n) return null
  const whole = rounded / costScale
  const fraction = String(rounded % costScale).padStart(4, "0").replace(/0+$/, "")
  return `${whole}${fraction ? `.${fraction}` : ""}`
}
