import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "@/features/auth/auth-context"
import { useBusiness } from "@/features/business/business-context"
import { useBusinessOverview } from "@/features/analytics/analytics-queries"
import { formatMoney, formatQuantity } from "@/features/inventory/inventory-format"
import { getFinanceDateRange, type FinancePeriod } from "@/features/finance/finance-period"
import { formatExpenseMoney } from "@/features/finance/finance-money"
import { useFinancialSummary } from "@/features/finance/finance-queries"
import { Button } from "@/components/ui/button"
import { InventoryStatus, RecordedSalesTrend } from "@/pages/dashboard-visualizations"

const financeRoles = ["owner", "manager"]
const purchasingRoles = ["owner", "manager", "employee"]

export function DashboardPage() {
  const { user } = useAuth()
  const { business, role, enabledModules, isLoading: isBusinessLoading } = useBusiness()
  const [period, setPeriod] = useState<FinancePeriod>("month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const range = useMemo(() => business ? getFinanceDateRange(period, business.timezone, new Date(), customStart, customEnd) : null, [business, customEnd, customStart, period])
  const inventoryRange = range ?? (business ? getFinanceDateRange("today", business.timezone) : null)
  const hasSales = enabledModules.includes("sales")
  const hasPurchasingAccess = Boolean(enabledModules.includes("purchasing") && role && purchasingRoles.includes(role))
  const hasFinanceAccess = Boolean(enabledModules.includes("expenses") && role && financeRoles.includes(role))
  const overview = useBusinessOverview(inventoryRange)
  const finance = useFinancialSummary(range, hasFinanceAccess)
  const currency = business?.currency ?? "USD"

  if (isBusinessLoading || !business) return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground" role="status">Loading workspace overview…</p>

  return <section className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">Dashboard</p><h1 className="mt-1 break-words text-3xl font-semibold tracking-tight">Welcome to {business.name}</h1><p className="mt-2 text-muted-foreground">A current view of your inventory and business activity.</p></div>
      <p className="text-sm text-muted-foreground">Signed in as {user?.email ?? "your account"}</p>
    </header>

    <section aria-label="Dashboard date range" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 sm:items-end">
      <label className="space-y-1.5 text-sm"><span>Period</span><select className={inputClass} onChange={(event) => setPeriod(event.target.value as FinancePeriod)} value={period}><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="custom">Custom</option></select></label>
      {period === "custom" && <>
        <label className="space-y-1.5 text-sm"><span>Start date</span><input className={inputClass} onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label>
        <label className="space-y-1.5 text-sm"><span>End date</span><input className={inputClass} onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label>
      </>}
      {range && <p className="text-sm text-muted-foreground sm:col-span-3">Business dates: {range.startDate} – {range.endDate}</p>}
    </section>
    {period === "custom" && !range && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">Choose valid dates in order. Custom ranges can include at most 366 calendar days.</p>}
    {period !== "custom" && !range && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">The workspace timezone is invalid, so this period cannot be loaded. Contact your workspace owner.</p>}

    <section aria-labelledby="inventory-summary-title" className="space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-primary">Core inventory</p><h2 className="mt-1 text-xl font-semibold" id="inventory-summary-title">Inventory overview</h2><p className="mt-1 text-xs text-muted-foreground">Current stock status, not limited to the selected period.</p></div><Button asChild size="sm" variant="outline"><Link to="/inventory">View inventory</Link></Button></div>
      {overview.isLoading && <p className="text-sm text-muted-foreground" role="status">Loading dashboard overview…</p>}
      {overview.isError && <ErrorMessage title="Dashboard overview unavailable" onRetry={() => void overview.refetch()}>We couldn't load this workspace's inventory and activity summary.</ErrorMessage>}
      {overview.data && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <CountCard label="Active Products" value={overview.data.inventory.activeProducts} to="/inventory" />
          <CountCard label="Low Stock" value={overview.data.inventory.lowStockProducts} to="/inventory?stock=low" />
          <CountCard label="Out of Stock" value={overview.data.inventory.outOfStockProducts} to="/inventory?stock=out" />
        </div>
        {overview.data.inventory.activeProducts === 0 ? <div className="rounded-lg border border-dashed p-4"><p className="font-medium">No active products yet</p><p className="mt-1 text-sm text-muted-foreground">Add products to start tracking stock.</p><Button asChild className="mt-3" size="sm" variant="outline"><Link to="/inventory">Open inventory</Link></Button></div>
          : overview.data.inventory.lowStockProducts + overview.data.inventory.outOfStockProducts === 0 ? <p className="rounded-lg border bg-muted/35 p-4 text-sm" role="status">Stock is healthy: no active products are low or out of stock.</p>
            : <div className="rounded-lg border bg-muted/35 p-4 text-sm" role="status">{overview.data.inventory.outOfStockProducts > 0 && <p>{overview.data.inventory.outOfStockProducts} {plural(overview.data.inventory.outOfStockProducts, "active product is", "active products are")} out of stock.</p>}{overview.data.inventory.lowStockProducts > 0 && <p>{overview.data.inventory.lowStockProducts} {plural(overview.data.inventory.lowStockProducts, "active product is", "active products are")} low on stock.</p>}</div>}
        <InventoryStatus inventory={overview.data.inventory} />
      </>}
    </section>

    {hasSales && <section aria-labelledby="sales-summary-title" className="space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div><p className="text-sm font-medium text-primary">Sales</p><h2 className="mt-1 text-xl font-semibold" id="sales-summary-title">Sales overview</h2><p className="mt-1 text-xs text-muted-foreground">Selected period: {range ? `${range.startDate} – ${range.endDate}` : "Choose a valid date range"}</p></div>
      {overview.isLoading && <p className="text-sm text-muted-foreground" role="status">Loading Sales summary…</p>}
      {overview.isError && <p className="text-sm text-muted-foreground">Sales summary is unavailable with the dashboard overview.</p>}
      {range && overview.data?.sales.enabled && <>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Recorded Sales" value={formatMoney(overview.data.sales.recordedSales, currency)} help={`${overview.data.sales.saleCount} ${plural(overview.data.sales.saleCount, "sale", "sales")} recorded`} />
          <Metric label="Sale Count" value={overview.data.sales.saleCount.toLocaleString()} />
          <Metric label="Average Recorded Sale" value={overview.data.sales.averageRecordedSale === null ? "—" : formatMoney(overview.data.sales.averageRecordedSale, currency)} help={overview.data.sales.averageRecordedSale === null ? "Unavailable when no sales were recorded" : undefined} />
          <Metric label="Units Sold During Period" value={formatQuantity(overview.data.sales.unitsSold)} />
        </dl>
        {overview.data.sales.saleCount === 0 ? <><p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No Sales were recorded in this period.</p><RecordedSalesTrend points={overview.data.sales.dailyTrend} currency={currency} /></> : <>
          <RecordedSalesTrend points={overview.data.sales.dailyTrend} currency={currency} />
          <TopProducts products={overview.data.sales.topProductsByUnitsSold} />
        </>}
        <Button asChild size="sm" variant="outline"><Link to="/sales/history">View Sales history</Link></Button>
      </>}
    </section>}

    {hasPurchasingAccess && <section aria-labelledby="purchasing-summary-title" className="space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div><p className="text-sm font-medium text-primary">Purchasing</p><h2 className="mt-1 text-xl font-semibold" id="purchasing-summary-title">Purchasing overview</h2></div>
      {overview.isLoading && <p className="text-sm text-muted-foreground" role="status">Loading Purchasing summary…</p>}
      {overview.isError && <p className="text-sm text-muted-foreground">Purchasing summary is unavailable with the dashboard overview.</p>}
      {range && overview.data?.purchasing.available && <>
        <dl className="grid gap-3 sm:grid-cols-3"><Metric label="Purchase Receipts" value={overview.data.purchasing.receiptCount?.toLocaleString() ?? "0"} /><Metric label="Purchase Receipt Total" value={formatMoney(overview.data.purchasing.purchaseReceipts ?? "0", currency)} /><Metric label="Quantity Received" value={formatQuantity(overview.data.purchasing.quantityReceived ?? "0")} /></dl>
        {overview.data.purchasing.receiptCount === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No Purchase Receipts were recorded in this period.</p>}
        <p className="text-xs text-muted-foreground">Purchase Receipts represent stock received; they are reported separately from expenses.</p>
        <Button asChild size="sm" variant="outline"><Link to="/purchasing/history">View Purchasing history</Link></Button>
      </>}
    </section>}

    {hasFinanceAccess && <FinanceSection summary={finance} currency={currency} />}
  </section>
}

const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"

function CountCard({ label, value, to }: { label: string; value: number; to: string }) {
  return <Link aria-label={`${label}: ${value}`} className="rounded-lg border p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring" to={to}><span className="block text-sm text-muted-foreground">{label}</span><span className="mt-1 block text-2xl font-semibold tabular-nums">{value.toLocaleString()}</span></Link>
}

function Metric({ label, value, help }: { label: string; value: string; help?: string }) {
  return <div className="min-w-0 rounded-lg border p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-all text-2xl font-semibold tabular-nums">{value}</dd>{help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}</div>
}

function TopProducts({ products }: { products: { productId: string; productName: string; productSku: string; unitsSold: string }[] }) {
  return <section aria-labelledby="top-products-title" className="rounded-lg border"><h3 className="border-b px-4 py-3 font-semibold" id="top-products-title">Top Products by Units Sold</h3>{products.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No product sales in this period.</p> : <ol className="divide-y">{products.map((product) => <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" key={product.productId}><div className="min-w-0"><p className="break-words font-medium">{product.productName}</p><p className="text-xs text-muted-foreground">SKU {product.productSku}</p></div><p className="shrink-0 text-sm tabular-nums">{formatQuantity(product.unitsSold)} units</p></li>)}</ol>}</section>
}

function FinanceSection({ summary, currency }: { summary: ReturnType<typeof useFinancialSummary>; currency: string }) {
  return <section aria-labelledby="finance-summary-title" className="space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
    <div><p className="text-sm font-medium text-primary">Finance</p><h2 className="mt-1 text-xl font-semibold" id="finance-summary-title">Estimated financial overview</h2></div>
    {summary.isLoading && <p className="text-sm text-muted-foreground" role="status">Loading Finance summary…</p>}
    {summary.isError && <ErrorMessage title="Finance summary unavailable" onRetry={() => void summary.refetch()}>Operational inventory and activity remain available. Finance data could not be loaded.</ErrorMessage>}
    {summary.data && <>
      {summary.data.saleCount === 0 && summary.data.operatingExpenses === "0.0000" && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No Sales or operating expenses were recorded in this period.</p>}
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Operating Expenses" value={formatExpenseMoney(summary.data.operatingExpenses, currency)} />
        <Metric label="Estimated Gross Profit" value={estimatedMoney(summary.data.estimatedGrossProfit, summary.data.costCoverageComplete, currency)} />
        <Metric label="Estimated Net Profit" value={estimatedMoney(summary.data.estimatedNetProfit, summary.data.costCoverageComplete, currency)} />
        <Metric label="Cost Coverage" value={`${summary.data.costedSaleItemCount.toLocaleString()} / ${summary.data.saleItemCount.toLocaleString()}`} help={summary.data.costCoverageComplete ? "All sale items have an estimated cost basis" : `${summary.data.missingCostSaleItemCount.toLocaleString()} sale items missing a cost basis`} />
      </dl>
      {!summary.data.costCoverageComplete && <p className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-3 text-sm" role="status">Estimated profitability is unavailable until all sale items in this period have a cost basis.</p>}
      <p className="text-xs text-muted-foreground">Profit figures are estimates, not accounting statements. Purchase Receipts are not subtracted as expenses.</p>
      <Button asChild size="sm" variant="outline"><Link to="/finance">View Finance overview</Link></Button>
    </>}
  </section>
}

function ErrorMessage({ title, children, onRetry }: { title: string; children: string; onRetry: () => void }) {
  return <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm" role="alert"><p className="font-medium text-destructive">{title}</p><p className="mt-1 text-muted-foreground">{children}</p><Button className="mt-3" onClick={onRetry} size="sm" variant="outline">Try again</Button></div>
}

function estimatedMoney(value: string | null, complete: boolean, currency: string) {
  return complete && value !== null ? formatExpenseMoney(value, currency) : "Unavailable"
}

function plural(value: number, singular: string, pluralForm: string) { return value === 1 ? singular : pluralForm }
