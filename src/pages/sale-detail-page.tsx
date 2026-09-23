import { ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { SalesSectionNav } from "@/components/sales/sales-section-nav"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/state"
import { useBusiness } from "@/features/business/business-context"
import { formatQuantity } from "@/features/inventory/inventory-format"
import { formatSaleMoney } from "@/features/sales/sales-money"
import { useSaleDetail } from "@/features/sales/sales-queries"

function formatSaleDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(date)
}

export function SaleDetailPage() {
  const { saleId = "" } = useParams()
  const { business } = useBusiness()
  const sale = useSaleDetail(saleId)

  return (
    <section className="space-y-6">
      <SalesSectionNav />
      {sale.isLoading && <LoadingState className="rounded-lg border border-border bg-card p-8 text-center" label="Loading sale details…" />}
      {sale.isError && !sale.isLoading && <Unavailable message="We couldn't load this sale. Please try again." onRetry={() => void sale.refetch()} />}
      {!sale.isLoading && !sale.isError && !sale.data && <Unavailable message="This sale is unavailable or could not be found." />}
      {!sale.isLoading && !sale.isError && sale.data && business && (
        <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div><Button asChild className="mb-4" size="sm" variant="outline"><Link to="/sales/history"><ArrowLeft aria-hidden="true" className="mr-2 size-4" />Sales history</Link></Button><p className="text-sm font-medium text-primary">Sale details</p><h1 className="mt-1 break-all text-2xl font-semibold tracking-tight">{sale.data.saleReference}</h1><p className="mt-2 text-muted-foreground">{formatSaleDate(sale.data.soldAt)}</p></div>
            <div className="min-w-40 rounded-lg border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Total</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatSaleMoney(sale.data.total, business.currency)}</p></div>
          </header>
          <dl className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Customer</dt><dd className="mt-1 font-medium">{sale.data.customerNameSnapshot ?? "Walk-in"}</dd></div><div><dt className="text-sm text-muted-foreground">Recorded by</dt><dd className="mt-1 font-medium">Team member</dd></div><div><dt className="text-sm text-muted-foreground">Items</dt><dd className="mt-1 font-medium">{sale.data.items.length}</dd></div>{sale.data.notes && <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Note</dt><dd className="mt-1 whitespace-pre-wrap break-words">{sale.data.notes}</dd></div>}</dl>
          <section aria-labelledby="sale-items-heading" className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3"><h2 className="font-semibold" id="sale-items-heading">Items sold</h2></div>
            <ul className="divide-y divide-border">{sale.data.items.map((item) => <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" key={item.id}><div className="min-w-0 flex-1"><p className="break-words font-medium">{item.productName}</p><p className="mt-1 text-sm text-muted-foreground">SKU {item.productSku}</p><p className="mt-1 text-sm text-muted-foreground">{formatQuantity(item.quantity)} × {formatSaleMoney(item.unitPrice, business.currency)}</p></div><p className="text-right font-semibold tabular-nums">{formatSaleMoney(item.lineTotal, business.currency)}</p></li>)}</ul>
            <div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="text-sm text-muted-foreground">Subtotal / total</span><span className="font-semibold tabular-nums">{formatSaleMoney(sale.data.total, business.currency)}</span></div>
          </section>
        </>
      )}
    </section>
  )
}

function Unavailable({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <section className="rounded-lg border border-border bg-card p-8 text-center"><h1 className="text-xl font-semibold">Sale unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{message}</p>{onRetry && <Button className="mt-4" onClick={onRetry} variant="outline">Try again</Button>}<div className="mt-4"><Button asChild variant="outline"><Link to="/sales/history">Back to sales history</Link></Button></div></section>
}
