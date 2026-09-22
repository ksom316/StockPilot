import { FolderCog, PackageOpen, Pencil, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { useBusiness } from "@/features/business/business-context"
import { CategoryManagerDialog } from "@/features/inventory/category-manager-dialog"
import { formatMoney, formatQuantity, getStockState, type StockState } from "@/features/inventory/inventory-format"
import { useInventoryCatalog, useInventoryMutations } from "@/features/inventory/inventory-queries"
import type { Product, ProductInput } from "@/features/inventory/inventory-types"
import { ProductFormDialog } from "@/features/inventory/product-form-dialog"

function StockBadge({ state }: { state: StockState }) {
  const classes = state === "Out of stock"
    ? "bg-destructive/10 text-destructive"
    : state === "Low stock"
      ? "bg-amber-100 text-amber-800"
      : "bg-primary/10 text-primary"
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{state}</span>
}

export function InventoryPage() {
  const { role } = useBusiness()
  const { business, categories, products } = useInventoryCatalog()
  const mutations = useInventoryMutations()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("active")
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showCategories, setShowCategories] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const canManage = role === "owner" || role === "manager" || role === "employee"

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return (products.data ?? []).filter((product) => {
      const matchesSearch = !query || product.name.toLocaleLowerCase().includes(query) || product.sku.toLocaleLowerCase().includes(query)
      const matchesCategory = categoryFilter === "all" || (categoryFilter === "uncategorized" ? !product.categoryId : product.categoryId === categoryFilter)
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? product.isActive : !product.isActive)
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [categoryFilter, products.data, search, statusFilter])

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

  const isLoading = products.isLoading || categories.isLoading
  const hasError = products.isError || categories.isError

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Core inventory</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Product catalog</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Manage product details and categories. Stock quantities are read-only until inventory movements are available.</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowCategories(true)} variant="outline"><FolderCog aria-hidden="true" className="mr-2 size-4" />Categories</Button>
            <Button onClick={() => setShowProductForm(true)}><Plus aria-hidden="true" className="mr-2 size-4" />Add product</Button>
          </div>
        )}
      </div>

      {successMessage && <div aria-live="polite" className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{successMessage}</div>}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <input className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setSearch(event.target.value)} placeholder="Search name or SKU" type="search" value={search} />
        </label>
        <label>
          <span className="sr-only">Filter by category</span>
          <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
            <option value="all">All categories</option>
            <option value="uncategorized">Uncategorized</option>
            {(categories.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="active">Active products</option>
            <option value="inactive">Inactive products</option>
            <option value="all">All statuses</option>
          </select>
        </label>
      </div>

      {isLoading && <div className="flex min-h-56 items-center justify-center rounded-xl border border-border bg-card" role="status"><span className="mr-3 size-5 animate-spin rounded-full border-2 border-border border-t-primary" />Loading products…</div>}
      {hasError && !isLoading && (
        <div className="rounded-xl border border-destructive/25 bg-card p-8 text-center" role="alert">
          <h2 className="text-lg font-semibold">Inventory unavailable</h2>
          <p className="mt-2 text-muted-foreground">We couldn't load the catalog. Please try again.</p>
          <Button className="mt-5" onClick={() => { void products.refetch(); void categories.refetch() }} variant="outline">Try again</Button>
        </div>
      )}
      {!isLoading && !hasError && filteredProducts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <PackageOpen aria-hidden="true" className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">{(products.data ?? []).length === 0 ? "No products yet" : "No matching products"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{(products.data ?? []).length === 0 ? (canManage ? "Add your first catalog product. It will start with zero stock." : "This business has not added any products yet.") : "Adjust your search or filters to see more products."}</p>
          {canManage && (products.data ?? []).length === 0 && <Button className="mt-5" onClick={() => setShowProductForm(true)}><Plus className="mr-2 size-4" />Add product</Button>}
        </div>
      )}
      {!isLoading && !hasError && filteredProducts.length > 0 && business && (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 text-right font-medium">Price</th><th className="px-4 py-3 text-right font-medium">Quantity</th><th className="px-4 py-3 font-medium">Stock</th>{canManage && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody className="divide-y divide-border">{filteredProducts.map((product) => <ProductRow canManage={canManage} currency={business.currency} key={product.id} onEdit={() => setEditingProduct(product)} product={product} />)}</tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">{filteredProducts.map((product) => <ProductCard canManage={canManage} currency={business.currency} key={product.id} onEdit={() => setEditingProduct(product)} product={product} />)}</div>
        </>
      )}

      {(showProductForm || editingProduct) && business && <ProductFormDialog categories={categories.data ?? []} currency={business.currency} onClose={() => { setShowProductForm(false); setEditingProduct(null) }} onSubmit={saveProduct} product={editingProduct ?? undefined} />}
      {showCategories && <CategoryManagerDialog categories={categories.data ?? []} onClose={() => setShowCategories(false)} onCreate={(input) => mutations.createCategory.mutateAsync(input)} onUpdate={(id, input) => mutations.updateCategory.mutateAsync({ id, input })} />}
    </section>
  )
}

function ProductRow({ product, currency, canManage, onEdit }: { product: Product; currency: string; canManage: boolean; onEdit: () => void }) {
  const stockState = getStockState(product.currentQuantity, product.lowStockThreshold)
  return <tr className={!product.isActive ? "opacity-60" : undefined}><td className="px-4 py-4"><p className="font-medium">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">SKU {product.sku}{!product.isActive && " · Inactive"}</p></td><td className="px-4 py-4 text-muted-foreground">{product.categoryName ?? "Uncategorized"}</td><td className="px-4 py-4 text-right">{formatMoney(product.sellingPrice, currency)}</td><td className="px-4 py-4 text-right font-medium">{formatQuantity(product.currentQuantity)}</td><td className="px-4 py-4"><StockBadge state={stockState} /></td>{canManage && <td className="px-4 py-4 text-right"><Button aria-label={`Edit ${product.name}`} onClick={onEdit} size="sm" variant="outline"><Pencil className="size-3.5" /></Button></td>}</tr>
}

function ProductCard({ product, currency, canManage, onEdit }: { product: Product; currency: string; canManage: boolean; onEdit: () => void }) {
  const stockState = getStockState(product.currentQuantity, product.lowStockThreshold)
  return <article className={`rounded-xl border border-border bg-card p-4 shadow-sm ${!product.isActive ? "opacity-60" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold">{product.name}</h2><p className="mt-1 text-xs text-muted-foreground">SKU {product.sku} · {product.categoryName ?? "Uncategorized"}</p></div>{canManage && <Button aria-label={`Edit ${product.name}`} className="shrink-0" onClick={onEdit} size="sm" variant="outline"><Pencil className="size-3.5" /></Button>}</div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Selling price</p><p className="mt-1 font-medium">{formatMoney(product.sellingPrice, currency)}</p></div><div><p className="text-xs text-muted-foreground">Quantity</p><p className="mt-1 font-medium">{formatQuantity(product.currentQuantity)}</p></div></div><div className="mt-4 flex items-center justify-between"><StockBadge state={stockState} />{!product.isActive && <span className="text-xs text-muted-foreground">Inactive</span>}</div></article>
}
