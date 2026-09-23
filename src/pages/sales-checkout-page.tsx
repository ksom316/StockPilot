import { PackagePlus, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { PageHeader } from "@/components/layout/page-header"
import { SalesSectionNav } from "@/components/sales/sales-section-nav"
import { Button } from "@/components/ui/button"
import { DialogShell } from "@/components/ui/dialog-shell"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state"
import { useBusiness } from "@/features/business/business-context"
import { useCustomerLookup, useCustomerMutations } from "@/features/customers/customer-queries"
import { findPossibleDuplicate } from "@/features/customers/customer-filters"
import type { BasicCustomer } from "@/features/customers/customer-types"
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
  const { business, enabledModules } = useBusiness()
  const customersEnabled = enabledModules.includes("customers")
  const customerLookup = useCustomerLookup()
  const customerMutations = useCustomerMutations()
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
  const [customerId, setCustomerId] = useState("")
  const [quickCreatedCustomer, setQuickCreatedCustomer] = useState<BasicCustomer | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickName, setQuickName] = useState("")
  const [quickPhone, setQuickPhone] = useState("")
  const [quickEmail, setQuickEmail] = useState("")
  const [quickError, setQuickError] = useState("")
  const [quickStatus, setQuickStatus] = useState("")
  const submissionLock = useRef(false)
  const customerScope = `${business?.id ?? ""}:${customersEnabled}`
  const previousCustomerScope = useRef(customerScope)
  useEffect(() => {
    if (previousCustomerScope.current === customerScope) return
    previousCustomerScope.current = customerScope
    setCustomerId("")
    setQuickCreatedCustomer(null)
    setCustomerSearch("")
    setQuickCreateOpen(false)
  }, [customerScope])

  const lookupCustomers = customerLookup.data ?? []
  const customers = quickCreatedCustomer && !lookupCustomers.some((customer) => customer.id === quickCreatedCustomer.id)
    ? [...lookupCustomers, quickCreatedCustomer]
    : lookupCustomers
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null
  const matchingCustomers = customers.filter((customer) => {
    const term = customerSearch.trim().toLocaleLowerCase()
    return customer.isActive && (!term || [customer.name, customer.phone ?? "", customer.email ?? ""].some((value) => value.toLocaleLowerCase().includes(term)))
  })
  const quickDuplicates = findPossibleDuplicate(lookupCustomers, quickPhone, quickEmail)

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
        customerId: customersEnabled ? customerId || null : null,
      })
      setSuccess(recorded)
      setCart([])
      setNotes("")
      setSelectedProductId("")
      setQuantity("1")
      setUnitPrice("")
      setCustomerId("")
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
      <PageHeader description="Choose products, review the transaction prices, and record the sale. Stock updates when the sale is saved." eyebrow="Sales" title="New sale" />

      {success && <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-primary/25 bg-primary/5 p-4" role="status"><div><p className="font-semibold">Sale recorded</p><p className="mt-1 text-sm">Reference: <span className="font-medium">{success.sale_reference}</span></p></div><div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link to={`/sales/${success.id}`}>View sale</Link></Button><Button onClick={() => setSuccess(null)} size="sm">New sale</Button></div></div>}
      {formError && <p aria-live="assertive" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{formError}</p>}
      {statusMessage && <p aria-live="polite" className="rounded-lg border border-border bg-card p-3 text-sm" role="status">{statusMessage}</p>}

      {customersEnabled && <section aria-labelledby="sale-customer-heading" className="rounded-lg border border-border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold" id="sale-customer-heading">Customer</h2><p className="mt-1 text-sm text-muted-foreground">Walk-in is selected by default. Customer fields are basic contact details only.</p></div><Button onClick={() => { setQuickCreateOpen(true); setQuickError(""); setQuickStatus("") }} size="sm" variant="outline">Add customer</Button></div><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-end"><label className="space-y-1.5 text-sm"><span>Search customers</span><input autoComplete="off" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Name, phone or email" type="search" value={customerSearch} /></label><label className="space-y-1.5 text-sm"><span>Sale customer</span><select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setCustomerId(event.target.value)} value={customerId}><option value="">Walk-in</option>{matchingCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}</select></label></div>{customerLookup.isError && <p className="mt-2 text-sm text-destructive" role="alert">Customer search is unavailable. You can still record this as Walk-in.</p>}{selectedCustomer && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-sm"><span><strong>{selectedCustomer.name}</strong>{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ""}{selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}</span><Button onClick={() => setCustomerId("")} size="sm" variant="outline">Use Walk-in</Button></div>}</section>}

      {products.isLoading && <LoadingState className="flex min-h-48 items-center justify-center rounded-lg border border-border bg-card" label="Loading products…" />}
      {products.isError && !products.isLoading && <ErrorState onRetry={retryProducts} title="Products unavailable">We couldn't load this business's products.</ErrorState>}
      {!products.isLoading && !products.isError && activeProducts.length === 0 && <EmptyState description="Add or reactivate products in Inventory before recording a sale." icon={PackagePlus} title="No active products available" />}

      {!products.isLoading && !products.isError && activeProducts.length > 0 && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <section aria-labelledby="select-products-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
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

          <section aria-labelledby="current-sale-heading" className="rounded-lg border border-border bg-card p-4 sm:p-6">
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
      {quickCreateOpen && <DialogShell description="Create a basic contact and select it for this sale. This does not record the sale." onClose={() => setQuickCreateOpen(false)} title="Quick-create customer"><form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void (async () => { setQuickError(""); const name = quickName.trim(); if (!name) { setQuickError("Customer name is required."); return } if (name.length > 160 || quickPhone.trim().length > 50 || quickEmail.trim().length > 320) { setQuickError("Check the allowed field lengths and try again."); return } try { const phone = quickPhone.trim() || null; const email = quickEmail.trim() || null; const id = await customerMutations.create.mutateAsync({ name, phone, email, note: null }); setQuickCreatedCustomer({ id, name, phone, email, isActive: true }); setCustomerId(id); setCustomerSearch(""); setQuickCreateOpen(false); setQuickStatus(`${name} was created and selected. Review the sale, then record it when ready.`) } catch (cause) { setQuickError(cause instanceof Error ? cause.message : "We couldn't create this customer.") } })() }}><label className="block space-y-1.5 text-sm"><span>Name *</span><input autoComplete="name" autoFocus className="h-10 w-full rounded-md border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/20" maxLength={160} onChange={(event) => setQuickName(event.target.value)} required value={quickName} /></label><label className="block space-y-1.5 text-sm"><span>Phone (optional)</span><input autoComplete="tel" className="h-10 w-full rounded-md border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/20" maxLength={50} onChange={(event) => setQuickPhone(event.target.value)} value={quickPhone} /></label><label className="block space-y-1.5 text-sm"><span>Email (optional)</span><input autoComplete="email" className="h-10 w-full rounded-md border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/20" maxLength={320} onChange={(event) => setQuickEmail(event.target.value)} type="email" value={quickEmail} /></label>{quickDuplicates.length > 0 && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">Possible match: {quickDuplicates.map((customer) => customer.name).join(", ")}. A separate record can still be created.</p>}{quickError && <p className="text-sm text-destructive" role="alert">{quickError}</p>}<div className="flex gap-2"><Button disabled={customerMutations.create.isPending} type="submit">{customerMutations.create.isPending ? "Creating…" : "Create and select"}</Button><Button onClick={() => setQuickCreateOpen(false)} type="button" variant="outline">Cancel</Button></div></form></DialogShell>}
      {quickStatus && <p className="sr-only" role="status">{quickStatus}</p>}
    </section>
  )
}
