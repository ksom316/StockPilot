import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { DialogShell } from "@/components/ui/dialog-shell"
import { FormField } from "@/components/ui/form-field"
import { formatQuantity } from "@/features/inventory/inventory-format"
import { InventoryDataError } from "@/features/inventory/inventory-service"
import type { Category, Product, ProductInput } from "@/features/inventory/inventory-types"

interface ProductFormDialogProps {
  product?: Product
  categories: Category[]
  currency: string
  onClose: () => void
  onSubmit: (input: ProductInput) => Promise<void>
}

interface Errors {
  name?: string
  sku?: string
  costPrice?: string
  sellingPrice?: string
  lowStockThreshold?: string
}

const moneyPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/
const quantityPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/

export function ProductFormDialog({ product, categories, currency, onClose, onSubmit }: ProductFormDialogProps) {
  const [name, setName] = useState(product?.name ?? "")
  const [sku, setSku] = useState(product?.sku ?? "")
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "")
  const [description, setDescription] = useState(product?.description ?? "")
  const [costPrice, setCostPrice] = useState(product?.costPrice ?? "0")
  const [sellingPrice, setSellingPrice] = useState(product?.sellingPrice ?? "0")
  const [lowStockThreshold, setLowStockThreshold] = useState(product?.lowStockThreshold ?? "0")
  const [isActive, setIsActive] = useState(product?.isActive ?? true)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = () => {
    const next: Errors = {}
    if (!name.trim()) next.name = "Enter a product name."
    else if (name.trim().length > 200) next.name = "Product name must be 200 characters or fewer."
    if (!sku.trim()) next.sku = "Enter a SKU."
    else if (sku.trim().length > 100) next.sku = "SKU must be 100 characters or fewer."
    if (!moneyPattern.test(costPrice.trim())) next.costPrice = `Enter a valid ${currency} amount with up to 4 decimal places.`
    if (!moneyPattern.test(sellingPrice.trim())) next.sellingPrice = `Enter a valid ${currency} amount with up to 4 decimal places.`
    if (!quantityPattern.test(lowStockThreshold.trim())) next.lowStockThreshold = "Enter a non-negative quantity with up to 3 decimal places."
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError("")
    if (!validate() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        sku: sku.trim(),
        categoryId: categoryId || null,
        description: description.trim() || null,
        costPrice: costPrice.trim(),
        sellingPrice: sellingPrice.trim(),
        lowStockThreshold: lowStockThreshold.trim(),
        isActive,
      })
    } catch (error) {
      if (error instanceof InventoryDataError && error.code === "23505") {
        setErrors((current) => ({ ...current, sku: "This SKU is already used by another product." }))
      } else {
        setFormError(error instanceof Error ? error.message : "We couldn't save this product.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DialogShell description={product ? "Update catalog details without changing stock." : "Create a zero-stock catalog product. Stock can be added later."} onClose={onClose} title={product ? "Edit product" : "Add product"} wide>
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        {formError && <p className="rounded-md border border-destructive/25 bg-destructive/8 p-3 text-sm text-destructive" role="alert">{formError}</p>}
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField autoFocus disabled={isSubmitting} error={errors.name} id="product-name" label="Product name" maxLength={200} onChange={(event) => setName(event.target.value)} value={name} />
          <FormField disabled={isSubmitting} error={errors.sku} id="product-sku" label="SKU" maxLength={100} onChange={(event) => setSku(event.target.value)} value={sku} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="product-category">Category <span className="font-normal text-muted-foreground">(optional)</span></label>
          <select className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" disabled={isSubmitting} id="product-category" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
            <option value="">Uncategorized</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField disabled={isSubmitting} error={errors.costPrice} id="cost-price" inputMode="decimal" label={`Cost price (${currency})`} onChange={(event) => setCostPrice(event.target.value)} value={costPrice} />
          <FormField disabled={isSubmitting} error={errors.sellingPrice} id="selling-price" inputMode="decimal" label={`Selling price (${currency})`} onChange={(event) => setSellingPrice(event.target.value)} value={sellingPrice} />
        </div>
        <FormField disabled={isSubmitting} error={errors.lowStockThreshold} id="low-stock-threshold" inputMode="decimal" label="Low-stock threshold" onChange={(event) => setLowStockThreshold(event.target.value)} value={lowStockThreshold} />
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="product-description">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
          <textarea className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" disabled={isSubmitting} id="product-description" maxLength={4000} onChange={(event) => setDescription(event.target.value)} value={description} />
        </div>
        {product && (
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Current quantity: <strong className="text-foreground">{formatQuantity(product.currentQuantity)}</strong> (read-only)</p>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium"><input checked={isActive} className="size-4 accent-primary" disabled={isSubmitting} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />Active product</label>
          </div>
        )}
        <div className="flex justify-end gap-3"><Button disabled={isSubmitting} onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={isSubmitting} type="submit">{isSubmitting ? "Saving…" : product ? "Save changes" : "Add product"}</Button></div>
      </form>
    </DialogShell>
  )
}
