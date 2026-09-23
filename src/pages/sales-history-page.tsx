import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/layout/page-header"
import { SalesSectionNav } from "@/components/sales/sales-section-nav"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state"
import { Table, TableBody, TableContainer, TableHead, TableRow, Td, Th } from "@/components/ui/table"
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
    <TableRow className="hover:bg-muted/30">
      <Td><Link className="font-medium text-primary hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={`/sales/${sale.id}`}>{sale.saleReference}</Link><div className="mt-1 text-xs text-muted-foreground">Customer: {sale.customerNameSnapshot ?? "Walk-in"}</div><div className="mt-1 max-w-xs break-words text-xs text-muted-foreground">{sale.notes ? `Note: ${sale.notes}` : "No note"}</div></Td>
      <Td>{formatSaleDate(sale.soldAt)}</Td>
      <Td>{sale.itemCount}</Td>
      <Td>Team member</Td>
      <Td align="right" className="font-medium tabular-nums">{formatSaleMoney(sale.total, currency)}</Td>
      <Td align="right"><Button asChild size="sm" variant="outline"><Link aria-label={`View sale ${sale.saleReference}`} to={`/sales/${sale.id}`}>View</Link></Button></Td>
    </TableRow>
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
      <PageHeader actions={<Button asChild><Link to="/sales">New sale</Link></Button>} description="Review completed sales and their recorded details." eyebrow="Sales" title="Sales history" />

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(150px,0.35fr))_auto] sm:items-end">
        <label className="space-y-1.5"><span className="text-sm font-medium">Search sales</span><input aria-label="Search sales" autoComplete="off" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateParam("q", event.target.value)} placeholder="Reference, customer, product or SKU" type="search" value={search} /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">From date</span><input aria-label="From date" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateParam("from", event.target.value)} type="date" value={from} /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">To date</span><input aria-label="To date" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => updateParam("to", event.target.value)} type="date" value={to} /></label>
        {hasFilters && <Button className="sm:mb-0.5" onClick={clearFilters} variant="outline">Clear filters</Button>}
      </div>
      {reversedRange && <p className="text-sm text-muted-foreground" role="status">The date range was invalid, so date filters were cleared.</p>}

      {history.isLoading && <LoadingState className="rounded-lg border border-border bg-card p-8 text-center" label="Loading sales history…" />}
      {history.isError && !history.isLoading && <ErrorState onRetry={() => void history.refetch()} title="Sales history unavailable">We couldn't load sales history. Please try again.</ErrorState>}
      {!history.isLoading && !history.isError && history.data?.length === 0 && <EmptyState action={<Button asChild><Link to="/sales">Record a sale</Link></Button>} description="Completed sales will appear here." title="No sales yet" />}
      {!history.isLoading && !history.isError && history.data && history.data.length > 0 && filteredSales.length === 0 && <EmptyState action={<Button onClick={clearFilters} variant="outline">Clear filters</Button>} description="Try changing or clearing your filters." title="No matching sales" />}

      {!history.isLoading && !history.isError && filteredSales.length > 0 && business && (
        <>
          <p className="text-sm text-muted-foreground">{filteredSales.length} {filteredSales.length === 1 ? "sale" : "sales"}</p>
          <TableContainer className="hidden md:block">
            <Table><caption className="sr-only">Sales history</caption>
              <TableHead><tr><Th>Sale</Th><Th>Date and time</Th><Th>Items</Th><Th>Recorded by</Th><Th align="right">Total</Th><Th align="right">Action</Th></tr></TableHead>
              <TableBody>{filteredSales.map((sale) => <SaleRow currency={business.currency} key={sale.id} sale={sale} />)}</TableBody>
            </Table>
          </TableContainer>
          <ul aria-label="Sales history" className="space-y-3 md:hidden">{filteredSales.map((sale) => <li className="rounded-lg border border-border bg-card p-4" key={sale.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link className="break-all font-semibold text-primary hover:underline" to={`/sales/${sale.id}`}>{sale.saleReference}</Link><p className="mt-1 text-sm text-muted-foreground">{formatSaleDate(sale.soldAt)}</p></div><span className="shrink-0 font-semibold tabular-nums">{formatSaleMoney(sale.total, business.currency)}</span></div><div className="mt-3 text-sm"><span className="font-medium">Customer:</span> {sale.customerNameSnapshot ?? "Walk-in"}</div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}</span><span>Team member</span>{sale.notes && <span className="max-w-full break-words">Note: {sale.notes}</span>}</div><Button asChild className="mt-4 w-full" size="sm" variant="outline"><Link aria-label={`View sale ${sale.saleReference}`} to={`/sales/${sale.id}`}>View sale</Link></Button></li>)}</ul>
        </>
      )}
    </section>
  )
}
