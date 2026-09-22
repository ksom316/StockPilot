import { PackagePlus, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useMemo, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { SalesSectionNav } from "@/components/sales/sales-section-nav"
import { Button } from "@/components/ui/button"
import { useBusiness } from "@/features/business/business-context"
import { formatQuantity } from "@/features/inventory/inventory-format"
import { parseDatabaseQuantity, parseQuantity } from "@/features/inventory/inventory-decimal"
import { useInventoryProducts } from "@/features/inventory/inventory-queries"
import { calculateSaleLineTotal, calculateSaleTotal, formatSaleMoney, parseSalePrice } from "@/features/sales/sales-money"
import { useRecordSale } from "@/features/sales/sales-queries"
import type { RecordedSale } from "@/features/sales/sales-types"

interface CartLine {
  productId: string
  name: string
  sku: string
  quantity: string
  unitPrice: string
}

interface FieldErrors {
  product?: string
  quantity?: string
  price?: string
}

export function SalesCheckoutPage() {
  const { business } = useBusiness()
  const products = useInventoryProducts()
  const recordSale = useRecordSale()
  const [search, setSearch] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unitPrice, setUnitPrice] = useState("")
  const [notes, setNotes] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [success, setSuccess] = useState<RecordedSale | null>(null)
  const submissionLock = useRef(false)

  const activeProducts = useMemo(() => (products.data ?? []).filter((product) => product.isActive), [products.data])
  const query = search.trim().toLocaleLowerCase()
  const matchingProducts = activeProducts.filter((product) => !query || product.name.toLocaleLowerCase().includes(query) || product.sku.toLocaleLowerCase().includes(query))
  const selectedProduct = activeProducts.find((product) => product.id === selectedProductId)
  const total = calculateSaleTotal(cart)
  const lineCount = cart.length

  const selectProduct = (productId: string, preservePrice = false) => {
    setSelectedProductId(productId)
    setErrors((current) => ({ ...current, product: undefined }))
    if (!preservePrice) {
      const product = activeProducts.find((item) => item.id === productId)
      setUnitPrice(product?.sellingPrice ?? "")
    }
  }

  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (recordSale.isPending) return
    const nextErrors: FieldErrors = {}
    if (!selectedProduct) nextErrors.product = "Choose an active product."
    const parsedQuantity = parseQuantity(quantity)
    if (!parsedQuantity) nextErrors.quantity = "Enter a quantity greater than zero with up to 3 decimal places."
    const parsedPrice = parseSalePrice(unitPrice)
    if (!parsedPrice) nextErrors.price = "Enter a price of zero or more with up to 4 decimal places."
    if (selectedProduct && parsedQuantity && parsedQuantity.scaled > parseDatabaseQuantity(selectedProduct.currentQuantity).scaled) {
      nextErrors.quantity = `Quantity exceeds the available stock (${formatQuantity(selectedProduct.currentQuantity)}).`
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || !selectedProduct || !parsedQuantity || !parsedPrice) return

    if (calculateSaleLineTotal(parsedQuantity.value, parsedPrice.value) === null) {
      setErrors({ ...nextErrors, price: "This quantity and price exceed the maximum supported line total." })
      return
    }

    const existing = cart.find((line) => line.productId === selectedProduct.id)
    const line: CartLine = {
      productId: selectedProduct.id,
      name: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity: parsedQuantity.value,
      unitPrice: parsedPrice.value,
    }
    const nextCart = existing
      ? cart.map((item) => item.productId === line.productId ? line : item)
      : [...cart, line]
    if (calculateSaleTotal(nextCart) === null) {
      setFormError("Adding this item would exceed the maximum supported sale total. Adjust quantities or prices and try again.")
      return
    }
    setCart((current) => existing
      ? current.map((item) => item.productId === line.productId ? line : item)
      : [...current, line])
    setFormError("")
    setStatusMessage(existing ? `${selectedProduct.name} updated in this sale.` : "")
    setSuccess(null)
  }

  const editLine = (line: CartLine) => {
    setSearch("")
    setSelectedProductId(line.productId)
    setQuantity(line.quantity)
    setUnitPrice(line.unitPrice)
    setErrors({})
    setFormError("")
  }

  const removeLine = (productId: string) => {
    setCart((current) => current.filter((line) => line.productId !== productId))
    setFormError("")
    if (selectedProductId === productId) setSelectedProductId("")
  }

  const submitSale = async () => {
    if (recordSale.isPending || submissionLock.current) return
    if (!cart.length) {
      setFormError("Add at least one item to the sale.")
      return
    }
    if (total === null) {
      setFormError("This sale exceeds the maximum supported total. Adjust quantities or prices and try again.")
      return
    }
    if (!business) {
      setFormError("Your workspace is unavailable. Refresh and try again.")
      return
    }
    for (const line of cart) {
      const product = activeProducts.find((item) => item.id === line.productId)
      if (!product) {
        setFormError(`${line.name} is no longer an active product. Remove it from the sale and continue.`)
        return
      }
      const parsedLineQuantity = parseQuantity(line.quantity)
      if (!parsedLineQuantity || parsedLineQuantity.scaled > parseDatabaseQuantity(product.currentQuantity).scaled) {
        setFormError(`${line.name} no longer has enough available stock. Adjust the quantity and try again.`)
        return
      }
    }
    setFormError("")
    setStatusMessage("")
    submissionLock.current = true
    try {
      const recorded = await recordSale.mutateAsync({
        items: cart.map((line) => ({ product_id: line.productId, quantity: line.quantity, unit_price: line.unitPrice })),
        notes: notes.trim() || null,
      })
      setSuccess(recorded)
      setCart([])
      setNotes("")
      setSelectedProductId("")
      setQuantity("1")
      setUnitPrice("")
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "We couldn't record this sale. Your cart is still here; please try again.")
    } finally {
      submissionLock.current = false
    }
  }

  const retryProducts = () => void products.refetch()

  return (
    <section className="space-y-6">
      <SalesSectionNav />
      <header>
        <p className="text-sm font-medium text-primary">Sales</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">New sale</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Choose products, review the transaction prices, and record the sale. Stock updates when the sale is saved.</p>
      </header>

      {success && <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/25 bg-primary/5 p-4" role="status"><div><p className="font-semibold">Sale recorded</p><p className="mt-1 text-sm">Reference: <span className="font-medium">{success.sale_reference}</span></p></div><div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link to={`/sales/${success.id}`}>View sale</Link></Button><Button onClick={() => setSuccess(null)} size="sm">New sale</Button></div></div>}
      {formError && <p aria-live="assertive" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{formError}</p>}
      {statusMessage && <p aria-live="polite" className="rounded-lg border border-border bg-card p-3 text-sm" role="status">{statusMessage}</p>}

      {products.isLoading && <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-card" role="status"><span className="mr-3 size-5 animate-spin rounded-full border-2 border-border border-t-primary" />Loading products…</div>}
      {products.isError && !products.isLoading && <div className="rounded-xl border border-destructive/25 bg-card p-7 text-center" role="alert"><h2 className="text-lg font-semibold">Products unavailable</h2><p className="mt-2 text-sm text-muted-foreground">We couldn't load this business's products.</p><Button className="mt-4" onClick={retryProducts} variant="outline">Try again</Button></div>}
      {!products.isLoading && !products.isError && activeProducts.length === 0 && <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center"><PackagePlus aria-hidden="true" className="mx-auto size-9 text-muted-foreground" /><h2 className="mt-3 text-lg font-semibold">No active products available</h2><p className="mt-1 text-sm text-muted-foreground">Add or reactivate products in Inventory before recording a sale.</p></div>}

      {!products.isLoading && !products.isError && activeProducts.length > 0 && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <section aria-labelledby="select-products-heading" className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackagePlus aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold" id="select-products-heading">Add products</h2><p className="text-sm text-muted-foreground">Search by name or SKU.</p></div></div>
            <form className="mt-5 space-y-4" noValidate onSubmit={addItem}>
              <label className="block space-y-1.5"><span className="text-sm font-medium">Search products</span><input autoComplete="off" className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setSearch(event.target.value)} placeholder="Product name or SKU" type="search" value={search} /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">Product</span><select aria-describedby={errors.product ? "sale-product-error" : undefined} aria-invalid={Boolean(errors.product)} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => selectProduct(event.target.value)} value={selectedProductId}><option value="">Choose a product</option>{matchingProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · SKU {product.sku} · {formatQuantity(product.currentQuantity)} available</option>)}</select>{errors.product && <p className="text-sm text-destructive" id="sale-product-error">{errors.product}</p>}{matchingProducts.length === 0 && <p className="text-sm text-muted-foreground">No active products match that search.</p>}</label>
              {selectedProduct && <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="break-words font-medium">{selectedProduct.name}</span><span className="text-muted-foreground">SKU {selectedProduct.sku}</span></div><p className="mt-1 text-muted-foreground">Available stock: <span className="font-medium text-foreground">{formatQuantity(selectedProduct.currentQuantity)}</span> · Catalog price: <span className="font-medium text-foreground">{formatSaleMoney(selectedProduct.sellingPrice, business?.currency ?? "USD")}</span></p></div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5"><span className="text-sm font-medium">Quantity</span><input aria-describedby={errors.quantity ? "sale-quantity-error" : "sale-quantity-help"} aria-invalid={Boolean(errors.quantity)} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" inputMode="decimal" onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined })) }} value={quantity} /><span className="block text-xs text-muted-foreground" id="sale-quantity-help">Up to 3 decimal places.</span>{errors.quantity && <span className="block text-sm text-destructive" id="sale-quantity-error">{errors.quantity}</span>}</label>
                <label className="block space-y-1.5"><span className="text-sm font-medium">Unit price</span><input aria-describedby={errors.price ? "sale-price-error" : "sale-price-help"} aria-invalid={Boolean(errors.price)} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" inputMode="decimal" onChange={(event) => { setUnitPrice(event.target.value); setErrors((current) => ({ ...current, price: undefined })) }} value={unitPrice} /><span className="block text-xs text-muted-foreground" id="sale-price-help">Transaction price; does not change catalog price. Up to 4 decimals.</span>{errors.price && <span className="block text-sm text-destructive" id="sale-price-error">{errors.price}</span>}</label>
              </div>
              <Button className="w-full sm:w-auto" disabled={recordSale.isPending} type="submit"><Plus aria-hidden="true" className="mr-2 size-4" />{cart.some((line) => line.productId === selectedProductId) ? "Update item in sale" : "Add to sale"}</Button>
            </form>
          </section>

          <section aria-labelledby="current-sale-heading" className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold" id="current-sale-heading">Current sale</h2><p aria-live="polite" className="mt-1 text-sm text-muted-foreground">{lineCount} {lineCount === 1 ? "item" : "items"}</p></div>{cart.length > 0 && <Button onClick={() => { setCart([]); setFormError("") }} size="sm" variant="outline"><RotateCcw aria-hidden="true" className="mr-1.5 size-4" />Clear sale</Button>}</div>
            {cart.length === 0 ? <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center"><p className="font-medium">Your sale is empty</p><p className="mt-1 text-sm text-muted-foreground">Add a product to begin.</p></div> : <ul aria-label="Items in current sale" className="mt-4 divide-y divide-border">{cart.map((line) => {
              const liveProduct = activeProducts.find((product) => product.id === line.productId)
              const lineTotal = calculateSaleLineTotal(line.quantity, line.unitPrice)
              return <li className="py-4 first:pt-0" key={line.productId}><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><p className="break-words font-medium">{line.name}</p><p className="mt-0.5 text-xs text-muted-foreground">SKU {line.sku}</p><p className="mt-2 text-sm text-muted-foreground">{line.quantity} × {formatSaleMoney(line.unitPrice, business?.currency ?? "USD")} = <span className="font-medium text-foreground">{lineTotal === null ? "—" : formatSaleMoney(lineTotal, business?.currency ?? "USD")}</span></p><p className="mt-1 text-xs text-muted-foreground">{liveProduct ? `${formatQuantity(liveProduct.currentQuantity)} available` : "Product no longer active"}</p></div><div className="flex shrink-0 gap-2"><Button aria-label={`Edit ${line.name}`} onClick={() => editLine(line)} size="sm" variant="outline">Edit</Button><Button aria-label={`Remove ${line.name}`} onClick={() => removeLine(line.productId)} size="sm" variant="outline"><Trash2 aria-hidden="true" className="size-4" /><span className="sr-only">Remove</span></Button></div></div></li>
            })}</ul>}
            <label className="mt-4 block space-y-1.5"><span className="text-sm font-medium">Sale note <span className="font-normal text-muted-foreground">(optional)</span></span><textarea className="min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Add a note for this sale" value={notes} /></label>
            <dl className="mt-5 border-t border-border pt-4"><div className="flex items-center justify-between"><dt className="text-sm text-muted-foreground">Subtotal</dt><dd className="text-lg font-semibold tabular-nums">{total === null ? "—" : formatSaleMoney(total, business?.currency ?? "USD")}</dd></div><div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><dt>Total</dt><dd>{total === null ? "—" : formatSaleMoney(total, business?.currency ?? "USD")}</dd></div></dl>
            {total === null && <p className="mt-2 text-sm text-destructive" role="alert">This sale exceeds the maximum supported total. Adjust quantities or prices.</p>}
            <Button className="mt-5 w-full" disabled={!cart.length || total === null || recordSale.isPending || products.isLoading} onClick={() => void submitSale()} type="button">{recordSale.isPending ? <><span aria-hidden="true" className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Recording sale…</> : "Record sale"}</Button>
            {recordSale.isPending && <p className="mt-2 text-center text-sm text-muted-foreground" role="status">Saving sale and updating inventory…</p>}
          </section>
        </div>
      )}
    </section>
  )
}
