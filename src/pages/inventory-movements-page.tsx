import { ArrowDownRight, ArrowUpRight, History, Search } from "lucide-react"
import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state"
import { Table, TableBody, TableContainer, TableHead, TableRow, Td, Th } from "@/components/ui/table"
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

const movementTypes = new Set<InventoryMovementType>(Object.keys(movementLabels) as InventoryMovementType[])
const uuidPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

function safeDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : ""
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
  return <Badge variant="neutral">{movementLabels[type]}</Badge>
}

export function InventoryMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const movements = useInventoryMovements()
  const search = searchParams.get("q") ?? ""
  const rawType = searchParams.get("type")
  const typeFilter = rawType && movementTypes.has(rawType as InventoryMovementType) ? rawType : "all"
  const rawProduct = searchParams.get("productId")
  const productFilter = rawProduct && uuidPattern.test(rawProduct) ? rawProduct : "all"
  const startDate = safeDate(searchParams.get("from"))
  const endDate = safeDate(searchParams.get("to"))

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
      <PageHeader description="A read-only record of stock changes across this business." eyebrow="Core inventory" title="Movement history" />

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="relative block sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Search product name or SKU</span>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search product or SKU" type="search" value={search} />
        </label>
        <label>
          <span className="sr-only">Filter by movement type</span>
          <select className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateFilter("type", event.target.value)} value={typeFilter}>
            <option value="all">All movement types</option>
            {Object.entries(movementLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by product</span>
          <select className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateFilter("productId", event.target.value)} value={productFilter}>
            <option value="all">All products</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">From date</span>
          <input aria-label="From date" className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateFilter("from", event.target.value)} type="date" value={startDate} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span className="block">To date</span>
          <input aria-label="To date" className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateFilter("to", event.target.value)} type="date" value={endDate} />
        </label>
        <div className="flex items-end">
          <Button className="w-full sm:w-auto" disabled={!hasFilters} onClick={clearFilters} type="button" variant="outline">Clear filters</Button>
        </div>
      </div>

      {movements.isLoading && <LoadingState className="flex min-h-52 items-center justify-center rounded-lg border border-border bg-card" label="Loading movement history…" />}
      {movements.isError && <ErrorState onRetry={() => void movements.refetch()} title="History unavailable">We couldn't load movement history. Please try again.</ErrorState>}
      {!movements.isLoading && !movements.isError && filteredMovements.length === 0 && (
        <EmptyState
          action={hasFilters ? <Button onClick={clearFilters} variant="outline">Clear filters</Button> : undefined}
          description={hasFilters ? "Try changing or clearing the filters." : "Stock changes recorded for this business will appear here."}
          icon={History}
          title={hasFilters ? "No matching movements" : "No stock movements yet"}
        />
      )}
      {!movements.isLoading && !movements.isError && filteredMovements.length > 0 && (
        <>
          <p aria-live="polite" className="text-sm text-muted-foreground">{filteredMovements.length} {filteredMovements.length === 1 ? "movement" : "movements"}</p>
          <TableContainer className="hidden lg:block">
            <Table>
              <TableHead><tr><Th>Date</Th><Th>Product</Th><Th>Type</Th><Th align="right">Change</Th><Th align="right">Balance</Th><Th>Reason</Th><Th>Recorded by</Th><Th>Source</Th></tr></TableHead>
              <TableBody>{filteredMovements.map((movement) => <TableRow className="hover:bg-muted/30" key={movement.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{formatTimestamp(movement.createdAt)}</Td>
                <Td className="max-w-56"><Link className="font-medium hover:text-primary hover:underline" to={`/inventory/movements?productId=${encodeURIComponent(movement.productId)}`}>{movement.productName}</Link><p className="mt-1 text-xs text-muted-foreground">SKU {movement.productSku}</p></Td>
                <Td><MovementType type={movement.movementType} /></Td>
                <Td align="right" className={`whitespace-nowrap font-semibold ${movement.quantity.startsWith("-") ? "text-foreground" : "text-primary"}`}>{movement.quantity.startsWith("-") ? <ArrowDownRight aria-hidden="true" className="mr-1 inline size-4" /> : <ArrowUpRight aria-hidden="true" className="mr-1 inline size-4" />}{signedQuantity(movement.quantity)}</Td>
                <Td align="right" className="whitespace-nowrap">{formatQuantity(movement.quantityBefore)} → {formatQuantity(movement.quantityAfter)}</Td>
                <Td className="max-w-64 whitespace-normal break-words text-muted-foreground">{movement.reason ?? "—"}</Td>
                <Td className="text-muted-foreground">{movement.actorUserId ? "Team member" : "System"}</Td>
                <Td className="text-muted-foreground">{sourceLabels[movement.sourceType] ?? movement.sourceType}</Td>
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>
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
    <li className="rounded-lg border border-border bg-card p-4">
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
