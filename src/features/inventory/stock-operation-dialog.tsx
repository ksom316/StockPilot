import { useMemo, useRef, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { DialogShell } from "@/components/ui/dialog-shell"
import { formatQuantity } from "@/features/inventory/inventory-format"
import { InventoryDataError } from "@/features/inventory/inventory-service"
import { buildStockMovement, type OtherDirection, type StockOperation } from "@/features/inventory/stock-operation"
import type { Product, StockMovementInput } from "@/features/inventory/inventory-types"

interface StockOperationDialogProps {
  product: Product
  onClose: () => void
  onSubmit: (input: StockMovementInput) => Promise<void>
}

const operationLabels: Record<StockOperation, string> = {
  stock_in: "Stock In",
  stock_out: "Stock Out",
  correction: "Adjustment / Correction",
  damaged: "Damaged",
  lost: "Lost",
  other: "Other",
}

export function StockOperationDialog({ product, onClose, onSubmit }: StockOperationDialogProps) {
  const [operation, setOperation] = useState<StockOperation>("stock_in")
  const [quantity, setQuantity] = useState("")
  const [reason, setReason] = useState("")
  const [otherDirection, setOtherDirection] = useState<OtherDirection>("increase")
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const result = useMemo(() => quantity.trim() ? buildStockMovement({
    productId: product.id,
    currentQuantity: product.currentQuantity,
    operation,
    enteredQuantity: quantity,
    reason,
    otherDirection,
  }) : null, [operation, otherDirection, product.currentQuantity, product.id, quantity, reason])
  const requiresReason = ["correction", "damaged", "lost", "other"].includes(operation)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submittingRef.current) return
    const next = buildStockMovement({ productId: product.id, currentQuantity: product.currentQuantity, operation, enteredQuantity: quantity, reason, otherDirection })
    if ("error" in next) {
      setFormError(next.error ?? "Check the stock operation details.")
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)
    setFormError("")
    try {
      await onSubmit(next.movement)
    } catch (error) {
      if (error instanceof InventoryDataError && error.code === "INSUFFICIENT_STOCK") setFormError(error.message)
      else setFormError(error instanceof Error ? error.message : "We couldn't record this stock operation.")
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <DialogShell description={`${product.name} · SKU ${product.sku}`} onClose={onClose} title="Manage stock">
      <div className="mb-5 rounded-lg bg-muted p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Recorded quantity</p>
        <p className="mt-1 text-2xl font-semibold">{formatQuantity(product.currentQuantity)} {product.baseUnit}</p>
      </div>
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="stock-operation">Operation</label>
          <select autoFocus className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" disabled={isSubmitting} id="stock-operation" onChange={(event) => { setOperation(event.target.value as StockOperation); setFormError("") }} value={operation}>
            {Object.entries(operationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {operation === "other" && (
          <fieldset>
            <legend className="text-sm font-medium">Direction</legend>
            <div className="mt-2 flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input checked={otherDirection === "increase"} disabled={isSubmitting} name="other-direction" onChange={() => setOtherDirection("increase")} type="radio" />Increase</label>
              <label className="flex items-center gap-2"><input checked={otherDirection === "decrease"} disabled={isSubmitting} name="other-direction" onChange={() => setOtherDirection("decrease")} type="radio" />Decrease</label>
            </div>
          </fieldset>
        )}
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="stock-quantity">{operation === "correction" ? `Physical count (${product.baseUnit})` : `Quantity (${product.baseUnit})`}</label>
          <input aria-describedby="quantity-help" className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" disabled={isSubmitting} id="stock-quantity" inputMode="decimal" onChange={(event) => { setQuantity(event.target.value); setFormError("") }} placeholder={operation === "correction" ? "Enter the counted total" : "Enter an amount"} value={quantity} />
          <p className="text-xs text-muted-foreground" id="quantity-help">Up to 3 decimal places. The final balance is confirmed by the server.</p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="stock-reason">Reason / notes {requiresReason ? "" : <span className="font-normal text-muted-foreground">(optional)</span>}</label>
          <textarea className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" disabled={isSubmitting} id="stock-reason" maxLength={1000} onChange={(event) => { setReason(event.target.value); setFormError("") }} placeholder={requiresReason ? "Explain why this change is needed" : "Add a note"} required={requiresReason} value={reason} />
        </div>
        {quantity.trim() && result && !result.error && (
          <div aria-live="polite" className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            Resulting quantity preview: <strong>{result.resultingQuantity} {product.baseUnit}</strong>
            <p className="mt-1 text-xs text-muted-foreground">Preview only. The server uses the latest stock balance when recording the operation.</p>
          </div>
        )}
        {formError && <p className="rounded-md border border-destructive/25 bg-destructive/8 p-3 text-sm text-destructive" role="alert">{formError}</p>}
        <div className="flex justify-end gap-3"><Button disabled={isSubmitting} onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={isSubmitting} type="submit">{isSubmitting ? "Recording…" : "Record operation"}</Button></div>
      </form>
    </DialogShell>
  )
}
