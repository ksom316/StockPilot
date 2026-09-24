import { ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { PurchasingSectionNav } from "@/components/purchasing/purchasing-section-nav"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/state"
import { useBusiness } from "@/features/business/business-context"
import { formatQuantity } from "@/features/inventory/inventory-format"
import { formatPurchaseMoney } from "@/features/purchasing/purchasing-money"
import { usePurchaseDetail } from "@/features/purchasing/purchasing-queries"

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(date)
}

export function PurchaseDetailPage() {
  const { purchaseId = "" } = useParams()
  const { business } = useBusiness()
  const purchase = usePurchaseDetail(purchaseId)

  return (
    <section className="space-y-6">
      <PurchasingSectionNav />
      {purchase.isLoading && <LoadingState className="rounded-lg border border-border bg-card p-8 text-center" label="Loading purchase details…" />}
      {purchase.isError && <Unavailable message="We couldn't load this purchase. Please try again." retry={() => void purchase.refetch()} />}
      {!purchase.isLoading && !purchase.isError && !purchase.data && <Unavailable message="This purchase is unavailable or could not be found." />}
      {purchase.data && business && (
        <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div><Button asChild className="mb-4" size="sm" variant="outline"><Link to="/purchasing/history"><ArrowLeft aria-hidden="true" className="mr-2 size-4" />Purchase history</Link></Button><p className="text-sm font-medium text-primary">Purchase details</p><h1 className="mt-1 break-all text-2xl font-semibold tracking-tight">{purchase.data.purchaseReference}</h1><p className="mt-2 text-muted-foreground">{formatDate(purchase.data.receivedAt)}</p></div>
            <div className="min-w-40 rounded-lg border border-border bg-card p-4"><p className="text-sm text-muted-foreground">Total</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatPurchaseMoney(purchase.data.total, business.currency)}</p></div>
          </header>
          <dl className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">Supplier</dt><dd className="mt-1 break-words font-medium">{purchase.data.supplierName || "No supplier"}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Recorded by</dt><dd className="mt-1 font-medium">Team member</dd></div>
            {purchase.data.notes && <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Note</dt><dd className="mt-1 whitespace-pre-wrap break-words">{purchase.data.notes}</dd></div>}
          </dl>
          <section aria-labelledby="purchase-items-heading" className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3"><h2 className="font-semibold" id="purchase-items-heading">Items received</h2></div>
            <ul className="divide-y divide-border">{purchase.data.items.map((item) => <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" key={item.id}><div className="min-w-0 flex-1"><p className="break-words font-medium">{item.productName}</p><p className="mt-1 break-all text-sm text-muted-foreground">{item.productSku ? `SKU ${item.productSku}` : "No SKU"}</p><p className="mt-1 text-sm text-muted-foreground">{formatQuantity(item.quantity)} {item.purchaseUnit} × {formatPurchaseMoney(item.unitCost, business.currency)}</p><p className="mt-1 text-xs text-muted-foreground">Added {formatQuantity(item.inventoryQuantity)} {item.baseUnit} · Base cost {formatPurchaseMoney(item.baseUnitCost, business.currency)} / {item.baseUnit}</p></div><p className="text-right font-semibold tabular-nums">{formatPurchaseMoney(item.lineTotal, business.currency)}</p></li>)}</ul>
            <div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="text-sm text-muted-foreground">Purchase total</span><span className="font-semibold tabular-nums">{formatPurchaseMoney(purchase.data.total, business.currency)}</span></div>
          </section>
        </>
      )}
    </section>
  )
}

function Unavailable({ message, retry }: { message: string; retry?: () => void }) {
  return <section className="rounded-lg border border-border bg-card p-8 text-center"><h1 className="text-xl font-semibold">Purchase unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{message}</p>{retry && <Button className="mt-4" onClick={retry} variant="outline">Try again</Button>}<div className="mt-4"><Button asChild variant="outline"><Link to="/purchasing/history">Back to purchase history</Link></Button></div></section>
}
