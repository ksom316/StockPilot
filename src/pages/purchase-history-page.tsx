import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { PageHeader } from "@/components/layout/page-header"
import { PurchasingSectionNav } from "@/components/purchasing/purchasing-section-nav"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state"
import { Table, TableBody, TableContainer, TableHead, TableRow, Td, Th } from "@/components/ui/table"
import { useBusiness } from "@/features/business/business-context"
import { formatPurchaseMoney } from "@/features/purchasing/purchasing-money"
import { usePurchaseHistory } from "@/features/purchasing/purchasing-queries"
import type { PurchaseSummary } from "@/features/purchasing/purchasing-types"

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? "" : value
}
function showDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}
function ViewLink({ purchase }: { purchase: PurchaseSummary }) {
  return <Button asChild size="sm" variant="outline"><Link aria-label={`View purchase ${purchase.purchaseReference}`} to={`/purchasing/${purchase.id}`}>View</Link></Button>
}

export function PurchaseHistoryPage() {
  const { business } = useBusiness()
  const query = usePurchaseHistory()
  const [q, setQ] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const reversed = Boolean(from && to && from > to)
  const safeFrom = reversed ? "" : validDate(from)
  const safeTo = reversed ? "" : validDate(to)
  const rows = useMemo(() => {
    const term = q.trim().toLocaleLowerCase()
    return (query.data ?? []).filter((purchase) => {
      const date = purchase.receivedAt.slice(0, 10)
      const matches = !term || purchase.purchaseReference.toLocaleLowerCase().includes(term) || (purchase.supplierName ?? "").toLocaleLowerCase().includes(term) || purchase.items.some((item) => item.productName.toLocaleLowerCase().includes(term) || (item.productSku ?? "").toLocaleLowerCase().includes(term))
      return matches && (!safeFrom || date >= safeFrom) && (!safeTo || date <= safeTo)
    })
  }, [query.data, q, safeFrom, safeTo])
  const clear = () => { setQ(""); setFrom(""); setTo("") }
  const hasFilters = Boolean(q || from || to)

  return (
    <section className="space-y-6">
      <PurchasingSectionNav />
      <PageHeader actions={<Button asChild><Link to="/purchasing">Receive stock</Link></Button>} description="Review received stock and its recorded costs." eyebrow="Purchasing" title="Purchase history" />

      <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(150px,0.35fr))_auto] sm:items-end">
        <label className="space-y-1.5 text-sm"><span>Search purchases</span><input className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setQ(event.target.value.slice(0, 120))} placeholder="Reference, supplier, product or SKU" type="search" value={q} /></label>
        <label className="space-y-1.5 text-sm"><span>From date</span><input className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setFrom(event.target.value)} type="date" value={safeFrom} /></label>
        <label className="space-y-1.5 text-sm"><span>To date</span><input className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setTo(event.target.value)} type="date" value={safeTo} /></label>
        {hasFilters && <Button onClick={clear} variant="outline">Clear filters</Button>}
      </div>
      {reversed && <p className="text-sm text-muted-foreground" role="status">The date range was reversed, so date filters were cleared.</p>}

      {query.isLoading && <LoadingState className="rounded-lg border border-border bg-card p-8 text-center" label="Loading purchase history…" />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} title="Purchase history unavailable">We couldn't load purchase history. Please try again.</ErrorState>}
      {!query.isLoading && !query.isError && query.data?.length === 0 && <EmptyState action={<Button asChild><Link to="/purchasing">Receive stock</Link></Button>} description="Completed receipts will appear here." title="No purchases yet" />}
      {!query.isLoading && !query.isError && Boolean(query.data?.length) && rows.length === 0 && <EmptyState action={<Button onClick={clear} variant="outline">Clear filters</Button>} description="Try changing or clearing your filters." title="No matching purchases" />}

      {rows.length > 0 && business && <>
        <p className="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "purchase" : "purchases"}. History is currently loaded as a single client-side list; revisit server pagination as data scales in Phase 5D.</p>
        <TableContainer className="hidden md:block">
          <Table><caption className="sr-only">Purchase history</caption>
            <TableHead><tr>{["Purchase", "Date and time", "Supplier", "Items", "Recorded by", "Total", "Action"].map((label) => <Th align={label === "Total" || label === "Action" ? "right" : "left"} key={label}>{label}</Th>)}</tr></TableHead>
            <TableBody>{rows.map((purchase) => <TableRow className="hover:bg-muted/30" key={purchase.id}>
              <Td><Link className="font-medium text-primary hover:underline" to={`/purchasing/${purchase.id}`}>{purchase.purchaseReference}</Link></Td>
              <Td>{showDate(purchase.receivedAt)}</Td>
              <Td>{purchase.supplierName || "No supplier"}</Td>
              <Td>{purchase.itemCount}</Td>
              <Td>Team member</Td>
              <Td align="right" className="font-medium tabular-nums">{formatPurchaseMoney(purchase.total, business.currency)}</Td>
              <Td align="right"><ViewLink purchase={purchase} /></Td>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
        <ul aria-label="Purchase history" className="space-y-3 md:hidden">{rows.map((purchase) => <li className="rounded-lg border border-border bg-card p-4" key={purchase.id}>
          <div className="flex justify-between gap-3"><div className="min-w-0"><Link className="break-all font-semibold text-primary" to={`/purchasing/${purchase.id}`}>{purchase.purchaseReference}</Link><p className="mt-1 text-sm text-muted-foreground">{showDate(purchase.receivedAt)}</p></div><span className="shrink-0 font-semibold tabular-nums">{formatPurchaseMoney(purchase.total, business.currency)}</span></div>
          <p className="mt-3 text-sm text-muted-foreground">{purchase.supplierName || "No supplier"} · {purchase.itemCount} {purchase.itemCount === 1 ? "item" : "items"} · Team member</p>
          <ViewLink purchase={purchase} />
        </li>)}</ul>
      </>}
    </section>
  )
}
