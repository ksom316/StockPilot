import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { DialogShell } from "@/components/ui/dialog-shell"
import { FormField } from "@/components/ui/form-field"
import { formatQuantity } from "@/features/inventory/inventory-format"
import { InventoryDataError } from "@/features/inventory/inventory-service"
import type { Category, CategoryInput, Product, ProductInput, SellingUnitInput } from "@/features/inventory/inventory-types"

interface ProductFormDialogProps {
  product?: Product
  categories: Category[]
  currency: string
  onClose: () => void
  onSubmit: (input: ProductInput) => Promise<void>
  onCreateCategory?: (input: CategoryInput) => Promise<Category>
}

interface Errors {
  name?: string
  sku?: string
  costPrice?: string
  sellingPrice?: string
  lowStockThreshold?: string
  baseUnit?: string
  purchaseUnit?: string
  purchaseConversionQuantity?: string
  sellingUnits?: string
}

const moneyPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/
const quantityPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/

export function ProductFormDialog({ product, categories: initialCategories, currency, onClose, onSubmit, onCreateCategory }: ProductFormDialogProps) {
  const [categories, setCategories] = useState(initialCategories)
  const [name, setName] = useState(product?.name ?? "")
  const [sku, setSku] = useState(product?.sku ?? "")
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "")
  const [description, setDescription] = useState(product?.description ?? "")
  const [costPrice, setCostPrice] = useState(product?.costPrice ?? "0")
  const [sellingPrice, setSellingPrice] = useState(product?.sellingPrice ?? "0")
  const [baseUnit, setBaseUnit] = useState(product?.baseUnit ?? "unit")
  const [purchaseUnit, setPurchaseUnit] = useState(product?.purchaseUnit ?? "unit")
  const [purchaseConversionQuantity, setPurchaseConversionQuantity] = useState(product?.purchaseConversionQuantity ?? "1")
  const [sellingUnits, setSellingUnits] = useState<SellingUnitInput[]>(product?.sellingUnits ?? [])
  const [lowStockThreshold, setLowStockThreshold] = useState(product?.lowStockThreshold ?? "0")
  const [isActive, setIsActive] = useState(product?.isActive ?? true)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [categoryError, setCategoryError] = useState("")

  const validate = () => {
    const next: Errors = {}
    if (!name.trim()) next.name = "Enter a product name."
    else if (name.trim().length > 200) next.name = "Product name must be 200 characters or fewer."
    if (sku.trim().length > 100) next.sku = "SKU must be 100 characters or fewer."
    if (!moneyPattern.test(costPrice.trim())) next.costPrice = `Enter a valid ${currency} amount with up to 4 decimal places.`
    if (!moneyPattern.test(sellingPrice.trim())) next.sellingPrice = `Enter a valid ${currency} amount with up to 4 decimal places.`
    if (!quantityPattern.test(lowStockThreshold.trim())) next.lowStockThreshold = "Enter a non-negative quantity with up to 3 decimal places."
    if (!baseUnit.trim()) next.baseUnit = "Enter a selling unit."
    else if (baseUnit.trim().length > 40) next.baseUnit = "Selling unit must be 40 characters or fewer."
    if (!purchaseUnit.trim()) next.purchaseUnit = "Enter a purchase unit."
    else if (purchaseUnit.trim().length > 40) next.purchaseUnit = "Purchase unit must be 40 characters or fewer."
    const normalizedConversion = purchaseUnit.trim().toLocaleLowerCase() === baseUnit.trim().toLocaleLowerCase() ? "1" : purchaseConversionQuantity.trim()
    if (!quantityPattern.test(normalizedConversion) || normalizedConversion === "0" || /^0\.0*$/.test(normalizedConversion)) next.purchaseConversionQuantity = "Enter a conversion quantity greater than zero with up to 3 decimal places."
    const seenUnits = new Set<string>()
    sellingUnits.forEach((sellingUnit) => {
      const normalizedUnit = sellingUnit.unit.trim().toLocaleLowerCase()
      if (!normalizedUnit || normalizedUnit.length > 40) next.sellingUnits = "Each additional selling unit must be 1–40 characters."
      else if (normalizedUnit === baseUnit.trim().toLocaleLowerCase()) next.sellingUnits = "Additional selling units must differ from the base selling unit."
      else if (seenUnits.has(normalizedUnit)) next.sellingUnits = "Additional selling units must be unique."
      else if (!quantityPattern.test(sellingUnit.conversionQuantity.trim()) || sellingUnit.conversionQuantity.trim() === "0" || /^0\.0*$/.test(sellingUnit.conversionQuantity.trim())) next.sellingUnits = "Enter a positive conversion quantity with up to 3 decimal places."
      else if (!moneyPattern.test(sellingUnit.sellingPrice.trim())) next.sellingUnits = `Enter a valid ${currency} price with up to 4 decimal places.`
      seenUnits.add(normalizedUnit)
    })
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
        sku: sku.trim() || null,
        categoryId: categoryId || null,
        description: description.trim() || null,
        costPrice: costPrice.trim(),
        sellingPrice: sellingPrice.trim(),
        baseUnit: baseUnit.trim(),
        purchaseUnit: purchaseUnit.trim(),
        purchaseConversionQuantity: purchaseUnit.trim().toLocaleLowerCase() === baseUnit.trim().toLocaleLowerCase() ? "1" : purchaseConversionQuantity.trim(),
        lowStockThreshold: lowStockThreshold.trim(),
        isActive,
        sellingUnits: sellingUnits.map((sellingUnit) => ({ unit: sellingUnit.unit.trim(), conversionQuantity: sellingUnit.conversionQuantity.trim(), sellingPrice: sellingUnit.sellingPrice.trim() })),
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

  const createInlineCategory = async () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) { setCategoryError("Enter a category name."); return }
    if (!onCreateCategory) return
    setIsSavingCategory(true); setCategoryError("")
    try {
      const category = await onCreateCategory({ name: trimmed })
      setCategories((current) => [...current, category].sort((left, right) => left.name.localeCompare(right.name)))
      setCategoryId(category.id); setNewCategoryName("")
    } catch (error) { setCategoryError(error instanceof Error ? error.message : "We couldn't create this category.") }
    finally { setIsSavingCategory(false) }
  }

  return (
    <DialogShell description={product ? "Update catalog details without changing stock." : "Create a zero-stock catalog product. Stock can be added later."} onClose={onClose} title={product ? "Edit product" : "Add product"} wide>
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        {formError && <p className="rounded-md border border-destructive/25 bg-destructive/8 p-3 text-sm text-destructive" role="alert">{formError}</p>}
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField autoFocus disabled={isSubmitting} error={errors.name} id="product-name" label="Product name" maxLength={200} onChange={(event) => setName(event.target.value)} value={name} />
          <div><FormField disabled={isSubmitting} error={errors.sku} id="product-sku" label="SKU (optional)" maxLength={100} onChange={(event) => setSku(event.target.value)} value={sku} /><p className="mt-1 text-xs text-muted-foreground">Stock Keeping Unit — your own code for identifying this product. Example: IPH15-BLK-128</p></div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="product-category">Category <span className="font-normal text-muted-foreground">(optional)</span></label>
          <select className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" disabled={isSubmitting} id="product-category" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
            <option value="">Uncategorized</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          {onCreateCategory && <div className="mt-2 rounded-md border border-dashed border-border p-3 text-sm"><p className="text-muted-foreground">{categories.length === 0 ? "No categories yet. Create categories to organize your products." : "Need another category?"}</p>{!isCreatingCategory && <button className="mt-1 font-medium text-primary underline-offset-2 hover:underline" disabled={isSubmitting} onClick={() => setIsCreatingCategory(true)} type="button">Create category</button>}{isCreatingCategory && <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input aria-label="New category name" className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" disabled={isSavingCategory} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Category name" value={newCategoryName} /><Button disabled={isSavingCategory} onClick={() => void createInlineCategory()} size="sm" type="button">Create</Button></div>}{categoryError && <p className="mt-1 text-sm text-destructive" role="alert">{categoryError}</p>}</div>}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField disabled={isSubmitting} error={errors.costPrice} id="cost-price" inputMode="decimal" label={`Cost per selling unit (${currency})`} onChange={(event) => setCostPrice(event.target.value)} value={costPrice} />
          <FormField disabled={isSubmitting} error={errors.sellingPrice} id="selling-price" inputMode="decimal" label={`Selling price per unit (${currency})`} onChange={(event) => setSellingPrice(event.target.value)} value={sellingPrice} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField disabled={isSubmitting} error={errors.baseUnit} id="base-unit" label="Selling unit" maxLength={40} onChange={(event) => setBaseUnit(event.target.value)} placeholder="kg, piece, pack, carton" value={baseUnit} />
          <FormField disabled={isSubmitting} error={errors.purchaseUnit} id="purchase-unit" label="Purchase unit" maxLength={40} onChange={(event) => setPurchaseUnit(event.target.value)} placeholder="carton" value={purchaseUnit} />
        </div>
        <FormField disabled={isSubmitting || purchaseUnit.trim().toLocaleLowerCase() === baseUnit.trim().toLocaleLowerCase()} error={errors.purchaseConversionQuantity} id="purchase-conversion-quantity" inputMode="decimal" label={`1 ${purchaseUnit.trim() || "purchase unit"} contains`} onChange={(event) => setPurchaseConversionQuantity(event.target.value)} value={purchaseUnit.trim().toLocaleLowerCase() === baseUnit.trim().toLocaleLowerCase() ? "1" : purchaseConversionQuantity} />
        {baseUnit.trim() && purchaseUnit.trim() && <p className="-mt-3 text-sm text-muted-foreground">1 {purchaseUnit.trim()} = {purchaseUnit.trim().toLocaleLowerCase() === baseUnit.trim().toLocaleLowerCase() ? "1" : purchaseConversionQuantity || "?"} {baseUnit.trim()}</p>}
        <section aria-labelledby="additional-selling-units-heading" className="space-y-3 rounded-lg border border-border p-4">
          <div><h3 className="font-medium" id="additional-selling-units-heading">Additional selling options</h3><p className="mt-1 text-sm text-muted-foreground">Keep the base option above, or add options such as a carton or pack with their own selling price.</p></div>
          {sellingUnits.map((sellingUnit, index) => <div className="rounded-md border border-border bg-muted/20 p-3" key={index}><div className="grid gap-4 sm:grid-cols-3"><FormField disabled={isSubmitting} id={`selling-unit-${index}`} label="Selling unit" maxLength={40} onChange={(event) => setSellingUnits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item))} placeholder="carton" value={sellingUnit.unit} /><FormField disabled={isSubmitting} id={`selling-unit-conversion-${index}`} inputMode="decimal" label={`1 ${sellingUnit.unit.trim() || "unit"} contains`} onChange={(event) => setSellingUnits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, conversionQuantity: event.target.value } : item))} value={sellingUnit.conversionQuantity} /><FormField disabled={isSubmitting} id={`selling-unit-price-${index}`} inputMode="decimal" label={`Selling price (${currency})`} onChange={(event) => setSellingUnits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sellingPrice: event.target.value } : item))} value={sellingUnit.sellingPrice} /></div><p className="mt-2 text-sm text-muted-foreground">{sellingUnit.unit.trim() && baseUnit.trim() ? `1 ${sellingUnit.unit.trim()} = ${sellingUnit.conversionQuantity || "?"} ${baseUnit.trim()}` : "Enter the unit relationship."}</p><Button disabled={isSubmitting} onClick={() => setSellingUnits((current) => current.filter((_, itemIndex) => itemIndex !== index))} size="sm" type="button" variant="outline">Remove</Button></div>)}
          <Button disabled={isSubmitting} onClick={() => setSellingUnits((current) => [...current, { unit: "", conversionQuantity: "1", sellingPrice: sellingPrice }])} type="button" variant="outline">Add selling unit</Button>
          {errors.sellingUnits && <p className="text-sm text-destructive" role="alert">{errors.sellingUnits}</p>}
        </section>
        <FormField disabled={isSubmitting} error={errors.lowStockThreshold} id="low-stock-threshold" inputMode="decimal" label={`Low-stock threshold (${baseUnit.trim() || "selling units"})`} onChange={(event) => setLowStockThreshold(event.target.value)} value={lowStockThreshold} />
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="product-description">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
          <textarea className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" disabled={isSubmitting} id="product-description" maxLength={4000} onChange={(event) => setDescription(event.target.value)} value={description} />
        </div>
        {product && (
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Current quantity: <strong className="text-foreground">{formatQuantity(product.currentQuantity)} {product.baseUnit}</strong> (read-only)</p>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium"><input checked={isActive} className="size-4 accent-primary" disabled={isSubmitting} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />Active product</label>
          </div>
        )}
        <div className="flex justify-end gap-3"><Button disabled={isSubmitting} onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={isSubmitting} type="submit">{isSubmitting ? "Saving…" : product ? "Save changes" : "Add product"}</Button></div>
      </form>
    </DialogShell>
  )
}
