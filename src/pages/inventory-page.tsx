import { ArrowUpDown, FolderCog, History, PackageOpen, Pencil, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state"
import { Table, TableBody, TableContainer, TableHead, TableRow, Td, Th } from "@/components/ui/table"
import { useBusiness } from "@/features/business/business-context"
import { CategoryManagerDialog } from "@/features/inventory/category-manager-dialog"
import { formatMoney, formatQuantity, getStockState, type StockState } from "@/features/inventory/inventory-format"
import { useInventoryCatalog, useInventoryMutations } from "@/features/inventory/inventory-queries"
import type { Product, ProductInput, StockMovementInput } from "@/features/inventory/inventory-types"
import { ProductFormDialog } from "@/features/inventory/product-form-dialog"
import { StockOperationDialog } from "@/features/inventory/stock-operation-dialog"

function StockBadge({ state }: { state: StockState }) {
  const variant = state === "Out of stock" ? "destructive" : state === "Low stock" ? "warning" : "success"
  return <Badge variant={variant}>{state}</Badge>
}

export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { role } = useBusiness()
  const { business, categories, products } = useInventoryCatalog()
  const mutations = useInventoryMutations()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("active")
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [showCategories, setShowCategories] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const stockParam = searchParams.get("stock")
  const stockFilter = stockParam === "attention" || stockParam === "low" || stockParam === "out" ? stockParam : "all"
  const canManage = role === "owner" || role === "manager" || role === "employee"

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return (products.data ?? []).filter((product) => {
      const matchesSearch = !query || product.name.toLocaleLowerCase().includes(query) || product.sku.toLocaleLowerCase().includes(query)
      const matchesCategory = categoryFilter === "all" || (categoryFilter === "uncategorized" ? !product.categoryId : product.categoryId === categoryFilter)
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? product.isActive : !product.isActive)
      const stockState = getStockState(product.currentQuantity, product.lowStockThreshold)
      const matchesStock = stockFilter === "all" || (stockFilter === "attention" ? stockState !== "In stock" : stockFilter === "low" ? stockState === "Low stock" : stockState === "Out of stock")
      return matchesSearch && matchesCategory && matchesStatus && matchesStock
    })
  }, [categoryFilter, products.data, search, statusFilter, stockFilter])

  const saveProduct = async (input: ProductInput) => {
    if (editingProduct) {
      await mutations.updateProduct.mutateAsync({ id: editingProduct.id, input })
      setSuccessMessage(`${input.name} was updated.`)
    } else {
      await mutations.createProduct.mutateAsync(input)
      setSuccessMessage(`${input.name} was added with zero stock.`)
    }
    setEditingProduct(null)
    setShowProductForm(false)
  }

  const recordMovement = async (input: StockMovementInput) => {
    await mutations.recordMovement.mutateAsync(input)
    setSuccessMessage(`Stock for ${stockProduct?.name ?? "the product"} was updated.`)
    setStockProduct(null)
  }

  const isLoading = products.isLoading || categories.isLoading
  const hasError = products.isError || categories.isError

  return (
    <section className="space-y-6">
      <PageHeader
        actions={canManage ? <>
          <Button onClick={() => setShowCategories(true)} variant="outline"><FolderCog aria-hidden="true" className="mr-2 size-4" />Categories</Button>
          <Button onClick={() => setShowProductForm(true)}><Plus aria-hidden="true" className="mr-2 size-4" />Add product</Button>
        </> : undefined}
        description="Manage catalog details, categories, and day-to-day stock changes."
        eyebrow="Core inventory"
        title="Product catalog"
      />

      {successMessage && <div aria-live="polite" className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{successMessage}</div>}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
        <label className="relative block flex-1 basis-56">
          <span className="sr-only">Search products</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" type="search" value={search} />
        </label>
        <label>
          <span className="sr-only">Filter by category</span>
          <select className="h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
            <option value="all">All categories</option>
            <option value="uncategorized">Uncategorized</option>
            {(categories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select className="h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="active">Active products</option>
            <option value="inactive">Inactive products</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by stock attention</span>
          <select className="h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => { const next = new URLSearchParams(searchParams); if (event.target.value === "all") next.delete("stock"); else next.set("stock", event.target.value); setSearchParams(next, { replace: true }) }} value={stockFilter}>
            <option value="all">All stock levels</option>
            <option value="attention">Needs attention</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
      </div>

      {isLoading && <LoadingState className="flex min-h-56 items-center justify-center rounded-lg border border-border bg-card" label="Loading products…" />}
      {hasError && !isLoading && (
        <ErrorState onRetry={() => { void products.refetch(); void categories.refetch() }} title="Inventory unavailable">We couldn't load the catalog. Please try again.</ErrorState>
      )}
      {!isLoading && !hasError && filteredProducts.length === 0 && (
        <EmptyState
          action={canManage && (products.data ?? []).length === 0 ? <Button onClick={() => setShowProductForm(true)}><Plus className="mr-2 size-4" />Add product</Button> : undefined}
          description={(products.data ?? []).length === 0 ? (canManage ? "Add your first catalog product. It will start with zero stock." : "This business has not added any products yet.") : "Adjust your search or filters to see more products."}
          icon={PackageOpen}
          title={(products.data ?? []).length === 0 ? "No products yet" : "No matching products"}
        />
      )}
      {!isLoading && !hasError && filteredProducts.length > 0 && business && (
        <>
          <TableContainer className="hidden md:block">
            <Table>
              <TableHead><tr><Th>Product</Th><Th>Category</Th><Th align="right">Price</Th><Th align="right">Quantity</Th><Th>Stock</Th><Th><span className="sr-only">Actions</span></Th></tr></TableHead>
              <TableBody>{filteredProducts.map((product) => <ProductRow canManage={canManage} currency={business.currency} key={product.id} onEdit={() => setEditingProduct(product)} onStock={() => setStockProduct(product)} product={product} />)}</TableBody>
            </Table>
          </TableContainer>
          <div className="grid gap-3 md:hidden">{filteredProducts.map((product) => <ProductCard canManage={canManage} currency={business.currency} key={product.id} onEdit={() => setEditingProduct(product)} onStock={() => setStockProduct(product)} product={product} />)}</div>
        </>
      )}

      {(showProductForm || editingProduct) && business && <ProductFormDialog categories={categories.data ?? []} currency={business.currency} onClose={() => { setShowProductForm(false); setEditingProduct(null) }} onSubmit={saveProduct} product={editingProduct ?? undefined} />}
      {showCategories && <CategoryManagerDialog categories={categories.data ?? []} onClose={() => setShowCategories(false)} onCreate={(input) => mutations.createCategory.mutateAsync(input)} onUpdate={(id, input) => mutations.updateCategory.mutateAsync({ id, input })} />}
      {stockProduct && <StockOperationDialog onClose={() => setStockProduct(null)} onSubmit={recordMovement} product={stockProduct} />}
    </section>
  )
}

function ProductRow({ product, currency, canManage, onEdit, onStock }: { product: Product; currency: string; canManage: boolean; onEdit: () => void; onStock: () => void }) {
  const stockState = getStockState(product.currentQuantity, product.lowStockThreshold)
  return <TableRow className={!product.isActive ? "opacity-60" : "hover:bg-muted/30"}>
    <Td><p className="font-medium">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">SKU {product.sku}{!product.isActive && " · Inactive"}</p></Td>
    <Td className="text-muted-foreground">{product.categoryName ?? "Uncategorized"}</Td>
    <Td align="right">{formatMoney(product.sellingPrice, currency)}</Td>
    <Td align="right" className="font-medium">{formatQuantity(product.currentQuantity)}</Td>
    <Td><StockBadge state={stockState} /></Td>
    <Td><div className="flex justify-end gap-2"><Button asChild size="sm" variant="outline"><Link aria-label={`View stock history for ${product.name}`} to={`/inventory/movements?productId=${encodeURIComponent(product.id)}`}><History aria-hidden="true" className="mr-1.5 size-3.5" />History</Link></Button>{canManage && <><Button aria-label={`Manage stock for ${product.name}`} onClick={onStock} size="sm" variant="outline"><ArrowUpDown className="mr-1.5 size-3.5" />Stock</Button><Button aria-label={`Edit ${product.name}`} onClick={onEdit} size="sm" variant="outline"><Pencil className="size-3.5" /></Button></>}</div></Td>
  </TableRow>
}

function ProductCard({ product, currency, canManage, onEdit, onStock }: { product: Product; currency: string; canManage: boolean; onEdit: () => void; onStock: () => void }) {
  const stockState = getStockState(product.currentQuantity, product.lowStockThreshold)
  return <article className={`rounded-lg border border-border bg-card p-4 ${!product.isActive ? "opacity-60" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold">{product.name}</h2><p className="mt-1 text-xs text-muted-foreground">SKU {product.sku} · {product.categoryName ?? "Uncategorized"}</p></div>{canManage && <Button aria-label={`Edit ${product.name}`} className="shrink-0" onClick={onEdit} size="sm" variant="outline"><Pencil className="size-3.5" /></Button>}</div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Selling price</p><p className="mt-1 font-medium">{formatMoney(product.sellingPrice, currency)}</p></div><div><p className="text-xs text-muted-foreground">Quantity</p><p className="mt-1 font-medium">{formatQuantity(product.currentQuantity)}</p></div></div><div className="mt-4 flex items-center justify-between"><StockBadge state={stockState} />{!product.isActive && <span className="text-xs text-muted-foreground">Inactive</span>}</div><div className="mt-4 grid grid-cols-2 gap-2"><Button asChild className="w-full" variant="outline"><Link aria-label={`View stock history for ${product.name}`} to={`/inventory/movements?productId=${encodeURIComponent(product.id)}`}><History className="mr-2 size-4" />History</Link></Button>{canManage && <Button className="w-full" onClick={onStock} variant="outline"><ArrowUpDown className="mr-2 size-4" />Manage stock</Button>}</div></article>
}
