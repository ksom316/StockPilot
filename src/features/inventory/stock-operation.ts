import { formatScaledQuantity, parseDatabaseQuantity, parseQuantity } from "@/features/inventory/inventory-decimal"
import type { StockMovementInput } from "@/features/inventory/inventory-types"

export type StockOperation = "stock_in" | "stock_out" | "correction" | "damaged" | "lost" | "other"
export type OtherDirection = "increase" | "decrease"

interface BuildStockMovementInput {
  productId: string
  currentQuantity: string
  operation: StockOperation
  enteredQuantity: string
  reason: string
  otherDirection: OtherDirection
}

export type StockOperationResult =
  | { error: string; movement?: never; resultingQuantity?: never }
  | { error?: never; movement: StockMovementInput; resultingQuantity: string }

const maxQuantity = 999999999999999999n

export function buildStockMovement(input: BuildStockMovementInput): StockOperationResult {
  const entered = parseQuantity(input.enteredQuantity)
  if (!entered) return { error: "Enter a non-negative quantity with up to 3 decimal places." }

  const current = parseDatabaseQuantity(input.currentQuantity).scaled
  const reason = input.reason.trim()
  const requiresReason = ["correction", "damaged", "lost", "other"].includes(input.operation)
  if (requiresReason && !reason) return { error: "Add a reason for this stock operation." }
  if (reason.length > 1000) return { error: "Reason must be 1,000 characters or fewer." }

  let movementType: StockMovementInput["movementType"]
  let rpcQuantity: bigint
  let signedDelta: bigint

  if (input.operation === "correction") {
    movementType = "adjustment"
    signedDelta = entered.scaled - current
    rpcQuantity = signedDelta
    if (signedDelta === 0n) return { error: "The physical count already matches the recorded quantity. No change is required." }
  } else {
    if (entered.scaled === 0n) return { error: "Quantity must be greater than zero." }
    if (input.operation === "other") {
      movementType = "adjustment"
      signedDelta = input.otherDirection === "increase" ? entered.scaled : -entered.scaled
      rpcQuantity = signedDelta
    } else {
      movementType = input.operation
      signedDelta = ["stock_out", "damaged", "lost"].includes(input.operation) ? -entered.scaled : entered.scaled
      rpcQuantity = entered.scaled
    }
  }

  const resulting = current + signedDelta
  if (resulting < 0n) return { error: "This operation would make stock negative. Enter a smaller quantity." }
  if (resulting > maxQuantity) return { error: "The resulting quantity exceeds the supported inventory limit." }

  return {
    movement: {
      productId: input.productId,
      movementType,
      quantity: formatScaledQuantity(rpcQuantity),
      reason: reason || null,
    },
    resultingQuantity: formatScaledQuantity(resulting),
  }
}
