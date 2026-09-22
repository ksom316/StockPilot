import { PackagePlus, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useMemo, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useBusiness } from "@/features/business/business-context"
import { formatQuantity } from "@/features/inventory/inventory-format"
import { parseDatabaseQuantity, parseQuantity } from "@/features/inventory/inventory-decimal"
import { useInventoryProducts } from "@/features/inventory/inventory-queries"
import { calculatePurchaseLineTotal, calculatePurchaseTotal, formatPurchaseMoney, maximumPurchaseQuantityScaled, parseUnitCost } from "@/features/purchasing/purchasing-money"
import { usePurchasingSuppliers, useRecordPurchase } from "@/features/purchasing/purchasing-queries"
import type { RecordedPurchase } from "@/features/purchasing/purchasing-types"

interface ReceiptLine {
  productId: string
  name: string
  sku: string
  quantity: string
  unitCost: string
}

interface FieldErrors {
  product?: string
  quantity?: string
  unitCost?: string
}

function newRequestId() {
  return globalThis.crypto.randomUUID()
}

export function PurchasingPage() {
  const { business } = useBusiness()
  const products = useInventoryProducts()
  const suppliers = usePurchasingSuppliers()
  const recordPurchase = useRecordPurchase()
  const [productSearch, setProductSearch] = useState("")
  const [supplierSearch, setSupplierSearch] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [selectedSupplierId, setSelectedSupplierId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unitCost, setUnitCost] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<ReceiptLine[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [success, setSuccess] = useState<RecordedPurchase | null>(null)
  const [requestId, setRequestId] = useState(newRequestId)
  const [failedRequest, setFailedRequest] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionLock = useRef(false)

  const activeProducts = useMemo(() => (products.data ?? []).filter((product) => product.isActive), [products.data])
  const productTerm = productSearch.trim().toLocaleLowerCase()
  const matchingProducts = activeProducts.filter((product) => !productTerm || product.name.toLocaleLowerCase().includes(productTerm) || product.sku.toLocaleLowerCase().includes(productTerm))
  const activeSuppliers = suppliers.data ?? []
  const supplierTerm = supplierSearch.trim().toLocaleLowerCase()
  const matchingSuppliers = activeSuppliers.filter((supplier) => !supplierTerm || supplier.name.toLocaleLowerCase().includes(supplierTerm))
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId)
  const total = calculatePurchaseTotal(items)
  const pending = recordPurchase.isPending || isSubmitting

  const markMaterialChange = () => {
    if (failedRequest) {
      setRequestId(newRequestId())
      setFailedRequest(false)
    }
    setSuccess(null)
    setFormError("")
  }

  const selectProduct = (productId: string) => {
    setSelectedProductId(productId)
    setErrors((current) => ({ ...current, product: undefined }))
    const product = activeProducts.find((item) => item.id === productId)
    setUnitCost(product?.costPrice ?? "")
  }

  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return

    const nextErrors: FieldErrors = {}
    const parsedQuantity = parseQuantity(quantity)
    const parsedCost = parseUnitCost(unitCost)
    if (!selectedProduct) nextErrors.product = "Choose an active product."
    if (!parsedQuantity || parsedQuantity.scaled <= 0n) nextErrors.quantity = "Enter a quantity greater than zero with up to 3 decimal places."
    if (!parsedCost) nextErrors.unitCost = "Enter a unit cost of zero or more with up to 4 decimal places."
    if (selectedProduct && parsedQuantity) {
      const nextStock = parseDatabaseQuantity(selectedProduct.currentQuantity).scaled + parsedQuantity.scaled
      if (nextStock > maximumPurchaseQuantityScaled) {
        nextErrors.quantity = "This receipt would exceed the maximum supported stock balance."
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length || !selectedProduct || !parsedQuantity || parsedQuantity.scaled <= 0n || !parsedCost) return

    const line: ReceiptLine = {
      productId: selectedProduct.id,
      name: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity: parsedQuantity.value,
      unitCost: parsedCost.value,
    }
    if (calculatePurchaseLineTotal(line.quantity, line.unitCost) === null) {
      setErrors({ unitCost: "This quantity and cost exceed the maximum supported line total." })
      return
    }
    const existing = items.find((item) => item.productId === line.productId)
    const nextItems = existing
      ? items.map((item) => item.productId === line.productId ? line : item)
      : [...items, line]
    if (calculatePurchaseTotal(nextItems) === null) {
      setFormError("Adding this item would exceed the maximum supported receipt total. Adjust quantities or costs and try again.")
      return
    }

    markMaterialChange()
    setItems(nextItems)
    setStatusMessage(existing ? `${selectedProduct.name} updated in this receipt.` : "")
    setSelectedProductId("")
    setQuantity("1")
    setUnitCost("")
  }

  const editItem = (line: ReceiptLine) => {
    markMaterialChange()
    setProductSearch("")
    setSelectedProductId(line.productId)
    setQuantity(line.quantity)
    setUnitCost(line.unitCost)
    setErrors({})
  }

  const removeItem = (productId: string) => {
    markMaterialChange()
    setItems((current) => current.filter((item) => item.productId !== productId))
    if (selectedProductId === productId) setSelectedProductId("")
  }

  const submitReceipt = async () => {
    if (recordPurchase.isPending || submissionLock.current) return
    if (!items.length) {
      setFormError("Add at least one product to the receipt.")
      return
    }
    if (total === null) {
      setFormError("This receipt exceeds the maximum supported total. Adjust quantities or costs and try again.")
      return
    }
    if (!business) {
      setFormError("Your workspace is unavailable. Refresh and try again.")
      return
    }
    for (const line of items) {
      if (!activeProducts.some((product) => product.id === line.productId)) {
        setFormError(`${line.name} is no longer active. Refresh the catalog and review this receipt.`)
        return
      }
    }

    setFormError("")
    setStatusMessage("")
    submissionLock.current = true
    setIsSubmitting(true)
    try {
      const recorded = await recordPurchase.mutateAsync({
        items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity, unit_cost: item.unitCost })),
        requestId,
        supplierId: selectedSupplierId || null,
        notes: notes.trim() || null,
      })
      setSuccess(recorded)
      setItems([])
      setNotes("")
      setSelectedSupplierId("")
      setSupplierSearch("")
      setSelectedProductId("")
      setProductSearch("")
      setQuantity("1")
      setUnitCost("")
      setRequestId(newRequestId())
      setFailedRequest(false)
    } catch (cause) {
      setFailedRequest(true)
      setFormError(cause instanceof Error ? cause.message : "We couldn't record this receipt. Your items are still here; please retry.")
    } finally {
      submissionLock.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Purchasing</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Receive stock</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Record products that have arrived. Stock and latest received costs update when this receipt is saved.</p>
      </header>

      {success && <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/25 bg-primary/5 p-4" role="status"><div><p className="font-semibold">Receipt recorded</p><p className="mt-1 text-sm">Reference: <span className="font-medium">{success.purchase_reference}</span></p></div><div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link to="/inventory">View inventory</Link></Button><Button onClick={() => setSuccess(null)} size="sm">Receive more stock</Button></div></div>}
      {formError && <p aria-live="assertive" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{formError}</p>}
      {statusMessage && <p aria-live="polite" className="rounded-lg border border-border bg-card p-3 text-sm" role="status">{statusMessage}</p>}

      {products.isLoading && <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-card" role="status"><span aria-hidden="true" className="mr-3 size-5 animate-spin rounded-full border-2 border-border border-t-primary" />Loading products...</div>}
      {products.isError && !products.isLoading && <div className="rounded-xl border border-destructive/25 bg-card p-7 text-center" role="alert"><h2 className="text-lg font-semibold">Products unavailable</h2><p className="mt-2 text-sm text-muted-foreground">We couldn't load this business's products.</p><Button className="mt-4" onClick={() => void products.refetch()} variant="outline">Try again</Button></div>}
      {!products.isLoading && !products.isError && activeProducts.length === 0 && <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center"><PackagePlus aria-hidden="true" className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 text-lg font-semibold">No active products available</h2><p className="mt-1 text-sm text-muted-foreground">Add or reactivate products in Inventory before receiving stock.</p></div>}

      {!products.isLoading && !products.isError && activeProducts.length > 0 && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <section aria-labelledby="receive-products-heading" className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackagePlus aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold" id="receive-products-heading">Add received products</h2><p className="text-sm text-muted-foreground">Search the active catalog by name or SKU.</p></div></div>

            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5"><span className="text-sm font-medium">Supplier <span className="font-normal text-muted-foreground">(optional)</span></span><input autoComplete="off" disabled={pending} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Search suppliers" type="search" value={supplierSearch} /><select aria-label="Supplier" disabled={pending} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => { setSelectedSupplierId(event.target.value); markMaterialChange() }} value={selectedSupplierId}><option value="">No supplier / unspecified</option>{matchingSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>{suppliers.isError && <p className="text-xs text-muted-foreground" role="status">Supplier list unavailable. You can continue without a supplier.</p>}{!suppliers.isLoading && !suppliers.isError && matchingSuppliers.length === 0 && supplierTerm && <p className="text-xs text-muted-foreground">No active suppliers match that search. You can continue without one.</p>}</label>

              <form className="space-y-4" noValidate onSubmit={addItem}>
                <label className="block space-y-1.5"><span className="text-sm font-medium">Search products</span><input autoComplete="off" disabled={pending} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setProductSearch(event.target.value)} placeholder="Product name or SKU" type="search" value={productSearch} /></label>
                <label className="block space-y-1.5"><span className="text-sm font-medium">Product</span><select aria-describedby={errors.product ? "purchase-product-error" : undefined} aria-invalid={Boolean(errors.product)} disabled={pending} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => selectProduct(event.target.value)} value={selectedProductId}><option value="">Choose a product</option>{matchingProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · SKU {product.sku}</option>)}</select>{errors.product && <p className="text-sm text-destructive" id="purchase-product-error">{errors.product}</p>}{matchingProducts.length === 0 && <p className="text-sm text-muted-foreground">No active products match that search.</p>}</label>
                {selectedProduct && <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="break-words font-medium">{selectedProduct.name}</span><span className="text-muted-foreground">SKU {selectedProduct.sku}</span></div><p className="mt-1 text-muted-foreground">Current stock: <span className="font-medium text-foreground">{formatQuantity(selectedProduct.currentQuantity)}</span> · Latest received cost: <span className="font-medium text-foreground">{formatPurchaseMoney(selectedProduct.costPrice, business?.currency ?? "USD")}</span></p></div>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5"><span className="text-sm font-medium">Quantity received</span><input aria-describedby={errors.quantity ? "purchase-quantity-error" : "purchase-quantity-help"} aria-invalid={Boolean(errors.quantity)} disabled={pending} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" inputMode="decimal" onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined })) }} value={quantity} /><span className="block text-xs text-muted-foreground" id="purchase-quantity-help">Up to 3 decimal places.</span>{errors.quantity && <span className="block text-sm text-destructive" id="purchase-quantity-error">{errors.quantity}</span>}</label>
                  <label className="block space-y-1.5"><span className="text-sm font-medium">Unit cost</span><input aria-describedby={errors.unitCost ? "purchase-cost-error" : "purchase-cost-help"} aria-invalid={Boolean(errors.unitCost)} disabled={pending} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" inputMode="decimal" onChange={(event) => { setUnitCost(event.target.value); setErrors((current) => ({ ...current, unitCost: undefined })) }} value={unitCost} /><span className="block text-xs text-muted-foreground" id="purchase-cost-help">This receipt's cost; up to 4 decimal places. Zero is allowed.</span>{errors.unitCost && <span className="block text-sm text-destructive" id="purchase-cost-error">{errors.unitCost}</span>}</label>
                </div>
                <Button className="w-full sm:w-auto" disabled={pending} type="submit"><Plus aria-hidden="true" className="mr-2 size-4" />{items.some((line) => line.productId === selectedProductId) ? "Update item in receipt" : "Add to receipt"}</Button>
              </form>
            </div>
          </section>

          <section aria-labelledby="current-receipt-heading" className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold" id="current-receipt-heading">Current receipt</h2><p aria-live="polite" className="mt-1 text-sm text-muted-foreground">{items.length} {items.length === 1 ? "item" : "items"}</p></div>{items.length > 0 && <Button disabled={pending} onClick={() => { markMaterialChange(); setItems([]) }} size="sm" variant="outline"><RotateCcw aria-hidden="true" className="mr-1.5 size-4" />Clear receipt</Button>}</div>
            {items.length === 0 ? <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center"><p className="font-medium">Your receipt is empty</p><p className="mt-1 text-sm text-muted-foreground">Add received stock to begin.</p></div> : <ul aria-label="Items in current receipt" className="mt-4 divide-y divide-border">{items.map((line) => {
              const lineTotal = calculatePurchaseLineTotal(line.quantity, line.unitCost)
              return <li className="py-4 first:pt-0" key={line.productId}><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><p className="break-words font-medium">{line.name}</p><p className="mt-0.5 text-xs text-muted-foreground">SKU {line.sku}</p><p className="mt-2 text-sm text-muted-foreground">{line.quantity} × {formatPurchaseMoney(line.unitCost, business?.currency ?? "USD")} = <span className="font-medium text-foreground">{lineTotal === null ? "—" : formatPurchaseMoney(lineTotal, business?.currency ?? "USD")}</span></p></div><div className="flex shrink-0 gap-2"><Button disabled={pending} aria-label={`Edit ${line.name}`} onClick={() => editItem(line)} size="sm" variant="outline">Edit</Button><Button disabled={pending} aria-label={`Remove ${line.name}`} onClick={() => removeItem(line.productId)} size="sm" variant="outline"><Trash2 aria-hidden="true" className="size-4" /><span className="sr-only">Remove</span></Button></div></div></li>
            })}</ul>}
            <label className="mt-4 block space-y-1.5"><span className="text-sm font-medium">Receipt note <span className="font-normal text-muted-foreground">(optional)</span></span><textarea disabled={pending} className="min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" maxLength={2000} onChange={(event) => { setNotes(event.target.value); markMaterialChange() }} placeholder="Add a note for this receipt" value={notes} /></label>
            <dl className="mt-5 border-t border-border pt-4"><div className="flex items-center justify-between gap-3"><dt className="text-sm text-muted-foreground">Receipt total</dt><dd className="text-right text-lg font-semibold tabular-nums">{total === null ? "—" : formatPurchaseMoney(total, business?.currency ?? "USD")}</dd></div></dl>
            {total === null && <p className="mt-2 text-sm text-destructive" role="alert">This receipt exceeds the maximum supported total. Adjust quantities or costs.</p>}
            <Button className="mt-5 w-full" disabled={!items.length || total === null || pending || products.isLoading} onClick={() => void submitReceipt()} type="button">{pending ? <><span aria-hidden="true" className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Recording receipt...</> : "Record receipt"}</Button>
            {pending && <p className="mt-2 text-center text-sm text-muted-foreground" role="status">Saving receipt and updating inventory...</p>}
          </section>
        </div>
      )}
    </section>
  )
}
