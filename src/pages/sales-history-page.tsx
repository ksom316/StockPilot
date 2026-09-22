import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { SalesSectionNav } from "@/components/sales/sales-section-nav"
import { useBusiness } from "@/features/business/business-context"
import { formatSaleMoney } from "@/features/sales/sales-money"
import { useSalesHistory } from "@/features/sales/sales-queries"
import type { SaleSummary } from "@/features/sales/sales-types"

function safeDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? "" : value
}

function formatSaleDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function SaleRow({ sale, currency }: { sale: SaleSummary; currency: string }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3"><Link className="font-medium text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" to={`/sales/${sale.id}`}>{sale.saleReference}</Link><div className="mt-1 text-xs text-muted-foreground">Customer: {sale.customerNameSnapshot ?? "Walk-in"}</div><div className="mt-1 max-w-xs break-words text-xs text-muted-foreground">{sale.notes ? `Note: ${sale.notes}` : "No note"}</div></td>
      <td className="px-4 py-3 text-sm">{formatSaleDate(sale.soldAt)}</td>
      <td className="px-4 py-3 text-sm">{sale.itemCount}</td>
      <td className="px-4 py-3 text-sm">Team member</td>
      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatSaleMoney(sale.total, currency)}</td>
      <td className="px-4 py-3 text-right"><Button asChild size="sm" variant="outline"><Link aria-label={`View sale ${sale.saleReference}`} to={`/sales/${sale.id}`}>View</Link></Button></td>
    </tr>
  )
}

export function SalesHistoryPage() {
  const { business } = useBusiness()
  const history = useSalesHistory()
  const [params, setParams] = useSearchParams()
  const search = (params.get("q") ?? "").slice(0, 120)
  const rawFrom = safeDate(params.get("from"))
  const rawTo = safeDate(params.get("to"))
  const reversedRange = Boolean(rawFrom && rawTo && rawFrom > rawTo)
  const from = reversedRange ? "" : rawFrom
  const to = reversedRange ? "" : rawTo

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clearFilters = () => setParams({}, { replace: true })
  const filteredSales = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return (history.data ?? []).filter((sale) => {
      const saleDate = sale.soldAt.slice(0, 10)
      const matchesSearch = !normalizedSearch || sale.saleReference.toLocaleLowerCase().includes(normalizedSearch) || (sale.customerNameSnapshot ?? "Walk-in").toLocaleLowerCase().includes(normalizedSearch) || sale.items.some((item) => item.productName.toLocaleLowerCase().includes(normalizedSearch) || item.productSku.toLocaleLowerCase().includes(normalizedSearch))
      return matchesSearch && (!from || saleDate >= from) && (!to || saleDate <= to)
    })
  }, [from, history.data, search, to])
  const hasFilters = Boolean(search || from || to || params.has("q") || params.has("from") || params.has("to"))

  return (
    <section className="space-y-6">
      <SalesSectionNav />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-medium text-primary">Sales</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Sales history</h1><p className="mt-2 text-muted-foreground">Review completed sales and their recorded details.</p></div>
        <Button asChild><Link to="/sales">New sale</Link></Button>
      </header>

      <section aria-label="Filter sales" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(150px,0.35fr))_auto] sm:items-end">
        <label className="space-y-1.5"><span className="text-sm font-medium">Search sales</span><input aria-label="Search sales" autoComplete="off" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => updateParam("q", event.target.value)} placeholder="Reference, customer, product or SKU" type="search" value={search} /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">From date</span><input aria-label="From date" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => updateParam("from", event.target.value)} type="date" value={from} /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">To date</span><input aria-label="To date" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" onChange={(event) => updateParam("to", event.target.value)} type="date" value={to} /></label>
        {hasFilters && <Button className="sm:mb-0.5" onClick={clearFilters} variant="outline">Clear filters</Button>}
      </section>
      {reversedRange && <p className="text-sm text-muted-foreground" role="status">The date range was invalid, so date filters were cleared.</p>}

      {history.isLoading && <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground" role="status">Loading sales history…</div>}
      {history.isError && !history.isLoading && <section className="rounded-xl border border-destructive/25 bg-card p-8 text-center" role="alert"><h2 className="font-semibold">Sales history unavailable</h2><p className="mt-2 text-sm text-muted-foreground">We couldn't load sales history. Please try again.</p><Button className="mt-4" onClick={() => void history.refetch()} variant="outline">Try again</Button></section>}
      {!history.isLoading && !history.isError && history.data?.length === 0 && <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><h2 className="font-semibold">No sales yet</h2><p className="mt-2 text-sm text-muted-foreground">Completed sales will appear here.</p><Button asChild className="mt-4"><Link to="/sales">Record a sale</Link></Button></div>}
      {!history.isLoading && !history.isError && history.data && history.data.length > 0 && filteredSales.length === 0 && <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center"><h2 className="font-semibold">No matching sales</h2><p className="mt-2 text-sm text-muted-foreground">Try changing or clearing your filters.</p><Button className="mt-4" onClick={clearFilters} variant="outline">Clear filters</Button></div>}

      {!history.isLoading && !history.isError && filteredSales.length > 0 && business && (
        <>
          <p className="text-sm text-muted-foreground">{filteredSales.length} {filteredSales.length === 1 ? "sale" : "sales"}</p>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block"><table className="w-full text-left"><caption className="sr-only">Sales history</caption><thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Sale</th><th className="px-4 py-3 font-medium">Date and time</th><th className="px-4 py-3 font-medium">Items</th><th className="px-4 py-3 font-medium">Recorded by</th><th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 text-right font-medium">Action</th></tr></thead><tbody>{filteredSales.map((sale) => <SaleRow currency={business.currency} key={sale.id} sale={sale} />)}</tbody></table></div>
          <ul aria-label="Sales history" className="space-y-3 md:hidden">{filteredSales.map((sale) => <li className="rounded-xl border border-border bg-card p-4" key={sale.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link className="break-all font-semibold text-primary hover:underline" to={`/sales/${sale.id}`}>{sale.saleReference}</Link><p className="mt-1 text-sm text-muted-foreground">{formatSaleDate(sale.soldAt)}</p></div><span className="shrink-0 font-semibold tabular-nums">{formatSaleMoney(sale.total, business.currency)}</span></div><div className="mt-3 text-sm"><span className="font-medium">Customer:</span> {sale.customerNameSnapshot ?? "Walk-in"}</div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}</span><span>Team member</span>{sale.notes && <span className="max-w-full break-words">Note: {sale.notes}</span>}</div><Button asChild className="mt-4 w-full" size="sm" variant="outline"><Link aria-label={`View sale ${sale.saleReference}`} to={`/sales/${sale.id}`}>View sale</Link></Button></li>)}</ul>
        </>
      )}
    </section>
  )
}
