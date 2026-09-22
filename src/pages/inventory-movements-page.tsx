import { ArrowDownRight, ArrowUpRight, History, Search } from "lucide-react"
import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { formatQuantity } from "@/features/inventory/inventory-format"
import { useInventoryMovements } from "@/features/inventory/inventory-queries"
import type { InventoryMovement, InventoryMovementType } from "@/features/inventory/inventory-types"

const movementLabels: Record<InventoryMovementType, string> = {
  stock_in: "Stock In",
  stock_out: "Stock Out",
  adjustment: "Adjustment",
  damaged: "Damaged",
  lost: "Lost",
}

const sourceLabels: Record<string, string> = {
  manual: "Manual",
  system: "System",
  sales: "Sales",
  purchasing: "Purchasing",
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown date"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function signedQuantity(value: string) {
  const formatted = formatQuantity(value)
  if (formatted.startsWith("-")) return `−${formatted.slice(1)}`
  return `+${formatted}`
}

function MovementType({ type }: { type: InventoryMovementType }) {
  return <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{movementLabels[type]}</span>
}

export function InventoryMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const movements = useInventoryMovements()
  const search = searchParams.get("q") ?? ""
  const typeFilter = searchParams.get("type") ?? "all"
  const productFilter = searchParams.get("productId") ?? "all"
  const startDate = searchParams.get("from") ?? ""
  const endDate = searchParams.get("to") ?? ""

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value && value !== "all") next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const products = useMemo(() => {
    const unique = new Map<string, { id: string; name: string; sku: string }>()
    for (const movement of movements.data ?? []) unique.set(movement.productId, { id: movement.productId, name: movement.productName, sku: movement.productSku })
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name))
  }, [movements.data])
  const filteredMovements = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return (movements.data ?? []).filter((movement) => {
      const matchesSearch = !term || movement.productName.toLocaleLowerCase().includes(term) || movement.productSku.toLocaleLowerCase().includes(term)
      const matchesType = typeFilter === "all" || movement.movementType === typeFilter
      const matchesProduct = productFilter === "all" || movement.productId === productFilter
      const movementDate = movement.createdAt.slice(0, 10)
      const matchesFrom = !startDate || movementDate >= startDate
      const matchesTo = !endDate || movementDate <= endDate
      return matchesSearch && matchesType && matchesProduct && matchesFrom && matchesTo
    })
  }, [endDate, movements.data, productFilter, search, startDate, typeFilter])
  const hasFilters = Boolean(search || typeFilter !== "all" || productFilter !== "all" || startDate || endDate)

  const clearFilters = () => setSearchParams({}, { replace: true })

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Core inventory</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Movement history</h1>
        <p className="mt-2 text-muted-foreground">A read-only record of stock changes across this business.</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
        <label className="relative block sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Search product name or SKU</span>
          <Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <input className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search product or SKU" type="search" value={search} />
        </label>
        <label>
          <span className="sr-only">Filter by movement type</span>
          <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => updateFilter("type", event.target.value)} value={typeFilter}>
            <option value="all">All movement types</option>
            {Object.entries(movementLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by product</span>
          <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => updateFilter("productId", event.target.value)} value={productFilter}>
            <option value="all">All products</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">From date</span>
          <input aria-label="From date" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => updateFilter("from", event.target.value)} type="date" value={startDate} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">To date</span>
          <input aria-label="To date" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => updateFilter("to", event.target.value)} type="date" value={endDate} />
        </label>
        <div className="flex items-end">
          <Button className="w-full sm:w-auto" disabled={!hasFilters} onClick={clearFilters} type="button" variant="outline">Clear filters</Button>
        </div>
      </div>

      {movements.isLoading && <div className="flex min-h-52 items-center justify-center rounded-xl border border-border bg-card" role="status"><span className="mr-3 size-5 animate-spin rounded-full border-2 border-border border-t-primary" />Loading movement history…</div>}
      {movements.isError && <div className="rounded-xl border border-destructive/25 bg-card p-8 text-center" role="alert"><h2 className="text-lg font-semibold">History unavailable</h2><p className="mt-2 text-muted-foreground">We couldn't load movement history. Please try again.</p><Button className="mt-5" onClick={() => void movements.refetch()} variant="outline">Try again</Button></div>}
      {!movements.isLoading && !movements.isError && filteredMovements.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <History aria-hidden="true" className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">{hasFilters ? "No matching movements" : "No stock movements yet"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{hasFilters ? "Try changing or clearing the filters." : "Stock changes recorded for this business will appear here."}</p>
          {hasFilters && <Button className="mt-5" onClick={clearFilters} variant="outline">Clear filters</Button>}
        </div>
      )}
      {!movements.isLoading && !movements.isError && filteredMovements.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">{filteredMovements.length} {filteredMovements.length === 1 ? "movement" : "movements"}</p>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 text-right font-medium">Change</th><th className="px-4 py-3 text-right font-medium">Balance</th><th className="px-4 py-3 font-medium">Reason</th><th className="px-4 py-3 font-medium">Recorded by</th><th className="px-4 py-3 font-medium">Source</th></tr></thead>
              <tbody className="divide-y divide-border">{filteredMovements.map((movement) => <tr key={movement.id}><td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatTimestamp(movement.createdAt)}</td><td className="max-w-56 px-4 py-4"><Link className="font-medium hover:text-primary hover:underline" to={`/inventory/movements?productId=${encodeURIComponent(movement.productId)}`}>{movement.productName}</Link><p className="mt-1 text-xs text-muted-foreground">SKU {movement.productSku}</p></td><td className="px-4 py-4"><MovementType type={movement.movementType} /></td><td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${movement.quantity.startsWith("-") ? "text-foreground" : "text-primary"}`}>{movement.quantity.startsWith("-") ? <ArrowDownRight aria-hidden="true" className="mr-1 inline size-4" /> : <ArrowUpRight aria-hidden="true" className="mr-1 inline size-4" />}{signedQuantity(movement.quantity)}</td><td className="whitespace-nowrap px-4 py-4 text-right">{formatQuantity(movement.quantityBefore)} → {formatQuantity(movement.quantityAfter)}</td><td className="max-w-64 whitespace-normal break-words px-4 py-4 text-muted-foreground">{movement.reason ?? "—"}</td><td className="px-4 py-4 text-muted-foreground">{movement.actorUserId ? "Team member" : "System"}</td><td className="px-4 py-4 text-muted-foreground">{sourceLabels[movement.sourceType] ?? movement.sourceType}</td></tr>)}</tbody>
            </table>
          </div>
          <ol aria-label="Stock movements" className="grid gap-3 lg:hidden">
            {filteredMovements.map((movement) => <MovementCard key={movement.id} movement={movement} />)}
          </ol>
        </>
      )}
    </section>
  )
}

function MovementCard({ movement }: { movement: InventoryMovement }) {
  const negative = movement.quantity.startsWith("-")
  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><Link className="break-words font-semibold hover:text-primary hover:underline" to={`/inventory/movements?productId=${encodeURIComponent(movement.productId)}`}>{movement.productName}</Link><p className="mt-1 text-xs text-muted-foreground">SKU {movement.productSku}</p></div>
        <span className="shrink-0 text-right font-semibold">{negative ? <ArrowDownRight aria-hidden="true" className="mr-1 inline size-4" /> : <ArrowUpRight aria-hidden="true" className="mr-1 inline size-4" />}{signedQuantity(movement.quantity)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><MovementType type={movement.movementType} /><span className="text-xs text-muted-foreground">{sourceLabels[movement.sourceType] ?? movement.sourceType}</span></div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Balance before</dt><dd className="mt-1 font-medium">{formatQuantity(movement.quantityBefore)}</dd></div><div><dt className="text-xs text-muted-foreground">Balance after</dt><dd className="mt-1 font-medium">{formatQuantity(movement.quantityAfter)}</dd></div></dl>
      {movement.reason && <p className="mt-3 break-words text-sm text-muted-foreground">{movement.reason}</p>}
      <p className="mt-3 text-xs text-muted-foreground">{formatTimestamp(movement.createdAt)} · {movement.actorUserId ? "Team member" : "System"}</p>
    </li>
  )
}
