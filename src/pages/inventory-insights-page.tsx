import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/layout/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { useBusiness } from "@/features/business/business-context"
import { formatEstimatedDays, formatSmartDateRange, formatSmartQuantity } from "@/features/smart-inventory/smart-inventory-format"
import { SMART_INVENTORY_PAGE_SIZE, useSmartInventorySnapshot } from "@/features/smart-inventory/smart-inventory-queries"
import type { SmartInventoryProduct, SmartInventoryStockState } from "@/features/smart-inventory/smart-inventory-types"

type PageFilter = "all" | "attention" | "out" | "low" | "history"

const stockLabels: Record<SmartInventoryStockState, string> = {
  OUT_OF_STOCK: "Out of Stock",
  LOW_STOCK: "Low Stock",
  IN_STOCK: "In Stock",
}

function StockState({ state }: { state: SmartInventoryStockState }) {
  const classes = state === "OUT_OF_STOCK"
    ? "border-destructive/25 bg-destructive/10 text-destructive"
    : state === "LOW_STOCK"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-primary/25 bg-primary/5 text-primary"
  return <Badge className={classes} variant="outline">{stockLabels[state]}</Badge>
}

function salesExplanation(product: SmartInventoryProduct, windowLabel: string) {
  const observation = product.salesObservation
  if (observation.contextCode === "SALES_DISABLED") return "Sales-based insights require recorded Sales history."
  if (observation.contextCode === "INSUFFICIENT_HISTORY") return `Not enough complete history yet for a 30-day Sales estimate (${observation.eligibleDays} of 30 eligible days).`
  if (observation.contextCode === "NO_RECORDED_SALES_30D") return `No Recorded Sales during the last 30 completed days (${windowLabel}).`
  return `${formatSmartQuantity(observation.recordedSalesQuantity)} units recorded in Sales across ${observation.distinctSaleDates ?? 0} Sales dates during the last 30 completed days.`
}

function estimateExplanation(product: SmartInventoryProduct) {
  if (product.daysOfStock.status === "ESTIMATE_AVAILABLE") return `Based on Recorded Sales across the last 30 completed days: ${formatEstimatedDays(product.daysOfStock.estimatedDays)}.`
  switch (product.daysOfStock.unavailableReason) {
    case "SALES_DISABLED": return "Sales-based estimates are unavailable because Sales is disabled."
    case "INSUFFICIENT_HISTORY": return "Not enough complete history yet for this estimate."
    case "OUT_OF_STOCK": return "Current stock is already zero."
    case "ZERO_RECORDED_SALES": return "No recent Recorded Sales rate is available for this estimate."
    case "FEWER_THAN_THREE_SALE_DATES": return "More Recorded Sales history is needed for this estimate."
    default: return "This estimate is not available for the current facts."
  }
}

function movementExplanation(product: SmartInventoryProduct) {
  if (product.inventoryMovementObservation.contextCode === "NO_RECORDED_INVENTORY_MOVEMENTS_30D") return "No recorded inventory movements during the last 30 completed days."
  if (product.inventoryMovementObservation.contextCode === "INSUFFICIENT_HISTORY") return "Inventory movement history is not complete for this 30-day window."
  return null
}

function ProductInsight({ product, windowLabel }: { product: SmartInventoryProduct; windowLabel: string }) {
  const stockExplanation = product.stock.state === "OUT_OF_STOCK"
    ? "Current stock is zero."
    : product.stock.state === "LOW_STOCK"
      ? `Current stock is ${formatSmartQuantity(product.stock.currentQuantity)} units, at or below the stock threshold of ${formatSmartQuantity(product.stock.lowStockThreshold)}.`
      : `Current stock is ${formatSmartQuantity(product.stock.currentQuantity)} units.`
  const movement = movementExplanation(product)

  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{product.productName}</h2>
          <p className="mt-1 text-xs text-muted-foreground">SKU {product.productSku || "Not provided"}</p>
        </div>
        <StockState state={product.stock.state} />
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Current Stock</dt><dd className="mt-1 font-medium">{formatSmartQuantity(product.stock.currentQuantity)} units</dd></div>
        <div><dt className="text-xs text-muted-foreground">Recorded Sales</dt><dd className="mt-1 font-medium">{product.salesObservation.recordedSalesQuantity === null ? "Unavailable" : `${formatSmartQuantity(product.salesObservation.recordedSalesQuantity)} units`}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Estimated Days of Stock</dt><dd className="mt-1 font-medium">{product.daysOfStock.status === "ESTIMATE_AVAILABLE" ? formatEstimatedDays(product.daysOfStock.estimatedDays) : "Unavailable"}</dd></div>
      </dl>
      <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
        <p>{stockExplanation}</p>
        <p>{salesExplanation(product, windowLabel)}</p>
        <p>{estimateExplanation(product)}</p>
        {movement && <p>{movement}</p>}
      </div>
    </article>
  )
}

export function InventoryInsightsPage() {
  const { enabledModules, role } = useBusiness()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<PageFilter>("all")
  const query = useSmartInventorySnapshot(page, SMART_INVENTORY_PAGE_SIZE)
  const snapshot = query.data

  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return (snapshot?.products ?? []).filter((product) => {
      const matchesSearch = !normalizedSearch || product.productName.toLocaleLowerCase().includes(normalizedSearch) || product.productSku.toLocaleLowerCase().includes(normalizedSearch)
      const matchesFilter = filter === "all"
        || (filter === "attention" && product.stock.reorderAttention)
        || (filter === "out" && product.stock.state === "OUT_OF_STOCK")
        || (filter === "low" && product.stock.state === "LOW_STOCK")
        || (filter === "history" && product.salesObservation.contextCode === "INSUFFICIENT_HISTORY")
      return matchesSearch && matchesFilter
    })
  }, [filter, search, snapshot?.products])

  if (!enabledModules.includes("smart_insights") || !["owner", "manager", "employee"].includes(role ?? "")) {
    return null
  }

  const pageProducts = snapshot?.products ?? []
  const outOfStock = pageProducts.filter((product) => product.stock.state === "OUT_OF_STOCK").length
  const lowStock = pageProducts.filter((product) => product.stock.state === "LOW_STOCK").length
  const insufficient = pageProducts.filter((product) => product.salesObservation.contextCode === "INSUFFICIENT_HISTORY").length
  const windowLabel = snapshot ? formatSmartDateRange(snapshot.window.startDate, snapshot.window.endDateExclusive) : "the completed 30-day window"
  const totalPages = snapshot?.pagination.totalPages ?? 0

  return (
    <section aria-labelledby="smart-inventory-heading" className="space-y-6">
      <PageHeader description="Use inventory and Recorded Sales history to understand stock attention and recent product activity." eyebrow="Deterministic inventory intelligence" title="Smart Inventory" titleId="smart-inventory-heading" />

      {query.isLoading && <div className="flex min-h-56 items-center justify-center rounded-xl border border-border bg-card" role="status"><span aria-hidden="true" className="mr-3 size-5 animate-spin rounded-full border-2 border-border border-t-primary" />Loading Smart Inventory…</div>}
      {query.isError && !query.isLoading && <div className="rounded-xl border border-destructive/25 bg-card p-8 text-center" role="alert"><h2 className="text-lg font-semibold">Smart Inventory unavailable</h2><p className="mt-2 text-muted-foreground">We couldn't load current inventory intelligence. Please try again.</p><Button className="mt-5" onClick={() => void query.refetch()} variant="outline">Try again</Button></div>}

      {snapshot && !query.isError && (
        <>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-semibold">Attention on this page</h2><p className="mt-1 text-sm text-muted-foreground">Counts reflect only the currently loaded page, not the full catalog.</p></div>
              <p className="text-sm text-muted-foreground">{snapshot.pagination.totalItems} active {snapshot.pagination.totalItems === 1 ? "product" : "products"} · Page {snapshot.pagination.page} of {Math.max(snapshot.pagination.totalPages, 1)}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Out of Stock" tone="destructive" value={outOfStock} />
              <StatCard label="Low Stock" tone="warning" value={lowStock} />
              <StatCard help="30-day observation window" label="Insufficient History" value={insufficient} />
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_14rem]">
            <label><span className="sr-only">Search this page</span><input aria-label="Search this page" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setSearch(event.target.value)} placeholder="Search this page by name or SKU" type="search" value={search} /></label>
            <label><span className="sr-only">Filter this page</span><select aria-label="Filter this page" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => setFilter(event.target.value as PageFilter)} value={filter}><option value="all">All on this page</option><option value="attention">Needs attention</option><option value="out">Out of Stock</option><option value="low">Low Stock</option><option value="history">Insufficient History</option></select></label>
          </div>
          <p className="text-xs text-muted-foreground">Search and filters apply to this page only because the Smart Inventory data contract does not provide server-side search or filtering.</p>

          {visibleProducts.length === 0 && <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><PackageSearch aria-hidden="true" className="mx-auto size-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">{pageProducts.length === 0 ? "No active products to analyze." : "No matching products on this page."}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{pageProducts.length === 0 ? "Add active products to begin reviewing stock facts." : "Adjust the page-scoped search or filter to see another fact on this page."}</p></div>}
          {visibleProducts.length > 0 && <div className="space-y-3">{visibleProducts.map((product) => <ProductInsight key={product.productId} product={product} windowLabel={windowLabel} />)}</div>}

          {totalPages > 1 && <nav aria-label="Smart Inventory pagination" className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-sm"><Button aria-label="Previous Smart Inventory page" disabled={page <= 1 || query.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} variant="outline"><ChevronLeft aria-hidden="true" className="mr-1 size-4" />Previous</Button><span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span><Button aria-label="Next Smart Inventory page" disabled={page >= totalPages || query.isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} variant="outline">Next<ChevronRight aria-hidden="true" className="ml-1 size-4" /></Button></nav>}
        </>
      )}
    </section>
  )
}

