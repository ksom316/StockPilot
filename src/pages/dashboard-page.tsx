import { AlertTriangle, CheckCircle2, PackageCheck } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/auth-context"
import { useBusiness } from "@/features/business/business-context"
import { getStockState } from "@/features/inventory/inventory-format"
import { useInventoryProducts } from "@/features/inventory/inventory-queries"
import { getModuleLabel } from "@/features/business/modules"

export function DashboardPage() {
  const { user } = useAuth()
  const { business, role, enabledModules } = useBusiness()
  const products = useInventoryProducts()
  const activeProducts = (products.data ?? []).filter((product) => product.isActive)
  const lowStockProducts = activeProducts.filter((product) => getStockState(product.currentQuantity, product.lowStockThreshold) === "Low stock")
  const outOfStockProducts = activeProducts.filter((product) => getStockState(product.currentQuantity, product.lowStockThreshold) === "Out of stock")
  const attentionCount = lowStockProducts.length + outOfStockProducts.length

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Dashboard</p>
        <h1 className="mt-1 break-words text-3xl font-semibold tracking-tight">Welcome to {business?.name ?? "your workspace"}</h1>
        <p className="mt-2 break-words text-muted-foreground">
          {business?.businessType ? `${business.businessType} workspace · ` : "Business workspace · "}Signed in as {user?.email ?? "your account"}
        </p>
      </div>

      <section aria-labelledby="inventory-summary-title" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Core inventory</p>
            <h2 className="mt-1 text-xl font-semibold" id="inventory-summary-title">Inventory overview</h2>
          </div>
          {!products.isError && <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/inventory">View inventory</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/inventory/movements">View stock history</Link></Button>
          </div>}
        </div>

        {products.isLoading && <p className="mt-5 text-sm text-muted-foreground" role="status">Loading inventory summary…</p>}
        {products.isError && <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm" role="alert"><p className="font-medium text-destructive">Inventory summary unavailable</p><p className="mt-1 text-muted-foreground">We couldn't load inventory information. You can retry from the inventory page.</p><Button asChild className="mt-3" size="sm" variant="outline"><Link to="/inventory">Open inventory</Link></Button></div>}
        {!products.isLoading && !products.isError && activeProducts.length === 0 && <div className="mt-5 rounded-lg border border-dashed border-border p-5"><p className="font-medium">No active products yet</p><p className="mt-1 text-sm text-muted-foreground">Inventory counts will appear after products are added.</p><Button asChild className="mt-3" size="sm" variant="outline"><Link to="/inventory">View inventory</Link></Button></div>}
        {!products.isLoading && !products.isError && activeProducts.length > 0 && <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Active products" value={activeProducts.length} />
            <SummaryCard label="Low stock" value={lowStockProducts.length} />
            <SummaryCard label="Out of stock" value={outOfStockProducts.length} />
          </dl>
          {attentionCount > 0 && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/35 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><p className="text-sm text-muted-foreground">{attentionCount} active {attentionCount === 1 ? "product needs" : "products need"} stock attention.</p></div>
            <Button asChild size="sm" variant="outline"><Link to="/inventory?stock=attention">View attention items</Link></Button>
          </div>}
        </>}
      </section>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><CheckCircle2 aria-hidden="true" className="size-6" /></span>
        <h2 className="mt-5 text-xl font-semibold">Workspace setup complete</h2>
        <p className="mt-2 max-w-xl leading-6 text-muted-foreground">Your role is <span className="font-medium capitalize text-foreground">{role}</span>. StockPilot is ready with the tools selected for this business.</p>
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="font-semibold">Active tools</h3>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <li className="flex items-center gap-2"><PackageCheck aria-hidden="true" className="size-5 text-primary" /><span>Inventory</span><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Core</span></li>
            {enabledModules.map((module) => <li className="flex items-center gap-2" key={module}><CheckCircle2 aria-hidden="true" className="size-5 text-primary" />{getModuleLabel(module)}</li>)}
          </ul>
          {enabledModules.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No optional modules enabled.</p>}
        </div>
      </div>
    </section>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></div>
}
