import { Link, useParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useBusiness } from "@/features/business/business-context"
import { formatSaleMoney } from "@/features/sales/sales-money"
import { useCustomerActivity } from "@/features/customers/customer-queries"

function date(value: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed)
}

export function CustomerProfilePage() {
  const { customerId = "" } = useParams()
  const { business, enabledModules } = useBusiness()
  const salesEnabled = enabledModules.includes("sales")
  const activity = useCustomerActivity(customerId)
  if (activity.isLoading) return <p className="rounded-xl border p-8 text-center text-muted-foreground" role="status">Loading customer profile…</p>
  if (activity.isError || !activity.data || !business) return <section className="space-y-4 rounded-xl border p-8 text-center" role="alert"><h1 className="text-xl font-semibold">Customer profile unavailable</h1><p className="text-sm text-muted-foreground">This customer may have been removed or is not available to your role.</p><Button asChild variant="outline"><Link to="/customers">Back to customers</Link></Button></section>
  const customer = activity.data
  return <section className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><Button asChild className="mb-4" size="sm" variant="outline"><Link to="/customers">← Customers</Link></Button><p className="text-sm font-medium text-primary">Customer profile</p><h1 className="mt-1 break-words text-3xl font-semibold tracking-tight">{customer.name}</h1><p className="mt-2 text-sm text-muted-foreground">{customer.isActive ? "Active" : "Inactive"} · {customer.phone ?? "No phone"} · {customer.email ?? "No email"}</p></div><div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Private note</p><p className="mt-1 max-w-md whitespace-pre-wrap break-words text-sm">{customer.note || "No note"}</p></div></header>
    <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">Recorded Sales are associated transaction totals, not payments received, profit, or a customer balance. Operational Sales access follows the existing Sales permissions; this profile and customer-specific summary are owner/manager features.</p>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Recorded sales" value={String(customer.saleCount)} /><Metric label="Recorded Sales total" value={formatSaleMoney(customer.recordedSalesTotal, business.currency)} /><Metric label="First sale" value={date(customer.firstSaleAt)} /><Metric label="Last sale" value={date(customer.lastSaleAt)} /></dl>
    <section aria-labelledby="customer-sales-heading" className="space-y-3"><div><h2 className="text-xl font-semibold" id="customer-sales-heading">Sales history</h2><p className="text-sm text-muted-foreground">Customer name on each row is the immutable sale-time snapshot.</p></div>
      {customer.sales.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No recorded Sales for this customer yet.</p> : <><div className="hidden overflow-x-auto rounded-xl border bg-card md:block"><table className="w-full text-left"><caption className="sr-only">Sales associated with {customer.name}</caption><thead className="border-b bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Reference", "Date", "Snapshot name", "Items", "Recorded total", ...(salesEnabled ? [""] : [])].map((label, index) => <th className="px-4 py-3 font-medium" key={`${label}-${index}`}>{label}</th>)}</tr></thead><tbody className="divide-y">{customer.sales.map((sale) => <tr key={sale.id}><td className="px-4 py-3 font-medium">{sale.saleReference}</td><td className="px-4 py-3">{date(sale.soldAt)}</td><td className="px-4 py-3">{sale.customerNameSnapshot}</td><td className="px-4 py-3">{sale.itemCount}</td><td className="px-4 py-3 text-right tabular-nums">{formatSaleMoney(sale.total, business.currency)}</td>{salesEnabled && <td className="px-4 py-3"><Button asChild size="sm" variant="outline"><Link to={`/sales/${sale.id}`}>View sale</Link></Button></td>}</tr>)}</tbody></table></div><ul className="space-y-3 md:hidden" aria-label="Customer sales history">{customer.sales.map((sale) => <li className="rounded-xl border bg-card p-4" key={sale.id}><p className="font-semibold">{sale.saleReference}</p><p className="mt-1 text-sm text-muted-foreground">{date(sale.soldAt)} · {sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}</p><p className="mt-1 text-sm">Customer: {sale.customerNameSnapshot}</p><p className="mt-2 font-medium tabular-nums">{formatSaleMoney(sale.total, business.currency)}</p>{salesEnabled && <Button asChild className="mt-3 w-full" size="sm" variant="outline"><Link to={`/sales/${sale.id}`}>View sale</Link></Button>}</li>)}</ul></>}
    </section>
  </section>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border bg-card p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-xl font-semibold tabular-nums">{value}</dd></div> }
