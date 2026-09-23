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
import { PageHeader, SectionHeader } from "@/components/layout/page-header"
import { ErrorState, LoadingState } from "@/components/ui/state"
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

  if (isBusinessLoading || !business) return <LoadingState className="rounded-lg border border-border bg-card p-8 text-center" label="Loading workspace overview…" />

  return <section className="space-y-8">
    <PageHeader
      actions={<p className="text-sm text-muted-foreground">Signed in as {user?.email ?? "your account"}</p>}
      description="A current view of your inventory and business activity."
      eyebrow="Dashboard"
      title={`Welcome to ${business.name}`}
    />

    <section aria-label="Dashboard date range" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
      <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Period</span><select className={inputClass} onChange={(event) => setPeriod(event.target.value as FinancePeriod)} value={period}><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="custom">Custom</option></select></label>
      {period === "custom" && <>
        <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Start date</span><input className={inputClass} onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label>
        <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">End date</span><input className={inputClass} onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label>
      </>}
      {range && <span className="ml-auto text-muted-foreground">Business dates: <span className="font-medium text-foreground">{range.startDate} – {range.endDate}</span></span>}
    </section>
    {period === "custom" && !range && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">Choose valid dates in order. Custom ranges can include at most 366 calendar days.</p>}
    {period !== "custom" && !range && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">The workspace timezone is invalid, so this period cannot be loaded. Contact your workspace owner.</p>}

    <div className="divide-y divide-border">
      <section aria-labelledby="inventory-summary-title" className="space-y-4 pb-8">
        <SectionHeader actions={<Button asChild size="sm" variant="outline"><Link to="/inventory">View inventory</Link></Button>} description="Current stock status, not limited to the selected period." id="inventory-summary-title" title="Inventory overview" />
        {overview.isLoading && <LoadingState label="Loading dashboard overview…" />}
        {overview.isError && <ErrorState onRetry={() => void overview.refetch()} title="Dashboard overview unavailable">We couldn't load this workspace's inventory and activity summary.</ErrorState>}
        {overview.data && <>
          <div className="grid gap-3 sm:grid-cols-3">
            <CountCard label="Active Products" value={overview.data.inventory.activeProducts} to="/inventory" />
            <CountCard label="Low Stock" tone={overview.data.inventory.lowStockProducts > 0 ? "warning" : "neutral"} value={overview.data.inventory.lowStockProducts} to="/inventory?stock=low" />
            <CountCard label="Out of Stock" tone={overview.data.inventory.outOfStockProducts > 0 ? "destructive" : "neutral"} value={overview.data.inventory.outOfStockProducts} to="/inventory?stock=out" />
          </div>
          {overview.data.inventory.activeProducts === 0 ? <div className="rounded-lg border border-dashed border-border p-4"><p className="font-medium">No active products yet</p><p className="mt-1 text-sm text-muted-foreground">Add products to start tracking stock.</p><Button asChild className="mt-3" size="sm" variant="outline"><Link to="/inventory">Open inventory</Link></Button></div>
            : overview.data.inventory.lowStockProducts + overview.data.inventory.outOfStockProducts === 0 ? <p className="rounded-lg border border-border bg-muted/35 p-4 text-sm" role="status">Stock is healthy: no active products are low or out of stock.</p>
              : <div className="rounded-lg border border-border bg-muted/35 p-4 text-sm" role="status">{overview.data.inventory.outOfStockProducts > 0 && <p>{overview.data.inventory.outOfStockProducts} {plural(overview.data.inventory.outOfStockProducts, "active product is", "active products are")} out of stock.</p>}{overview.data.inventory.lowStockProducts > 0 && <p>{overview.data.inventory.lowStockProducts} {plural(overview.data.inventory.lowStockProducts, "active product is", "active products are")} low on stock.</p>}</div>}
          <InventoryStatus inventory={overview.data.inventory} />
        </>}
      </section>

      {hasSales && <section aria-labelledby="sales-summary-title" className="space-y-4 py-8">
        <SectionHeader description={`Selected period: ${range ? `${range.startDate} – ${range.endDate}` : "Choose a valid date range"}`} id="sales-summary-title" title="Sales overview" />
        {overview.isLoading && <LoadingState label="Loading Sales summary…" />}
        {overview.isError && <p className="text-sm text-muted-foreground">Sales summary is unavailable with the dashboard overview.</p>}
        {range && overview.data?.sales.enabled && <>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Recorded Sales" value={formatMoney(overview.data.sales.recordedSales, currency)} help={`${overview.data.sales.saleCount} ${plural(overview.data.sales.saleCount, "sale", "sales")} recorded`} />
            <Metric label="Sale Count" value={overview.data.sales.saleCount.toLocaleString()} />
            <Metric label="Average Recorded Sale" value={overview.data.sales.averageRecordedSale === null ? "—" : formatMoney(overview.data.sales.averageRecordedSale, currency)} help={overview.data.sales.averageRecordedSale === null ? "Unavailable when no sales were recorded" : undefined} />
            <Metric label="Units Sold During Period" value={formatQuantity(overview.data.sales.unitsSold)} />
          </dl>
          {overview.data.sales.saleCount === 0 ? <><p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No Sales were recorded in this period.</p><RecordedSalesTrend points={overview.data.sales.dailyTrend} currency={currency} /></> : <>
            <RecordedSalesTrend points={overview.data.sales.dailyTrend} currency={currency} />
            <TopProducts products={overview.data.sales.topProductsByUnitsSold} />
          </>}
          <Button asChild size="sm" variant="outline"><Link to="/sales/history">View Sales history</Link></Button>
        </>}
      </section>}

      {hasPurchasingAccess && <section aria-labelledby="purchasing-summary-title" className="space-y-4 py-8">
        <SectionHeader id="purchasing-summary-title" title="Purchasing overview" />
        {overview.isLoading && <LoadingState label="Loading Purchasing summary…" />}
        {overview.isError && <p className="text-sm text-muted-foreground">Purchasing summary is unavailable with the dashboard overview.</p>}
        {range && overview.data?.purchasing.available && <>
          <dl className="grid gap-3 sm:grid-cols-3"><Metric label="Purchase Receipts" value={overview.data.purchasing.receiptCount?.toLocaleString() ?? "0"} /><Metric label="Purchase Receipt Total" value={formatMoney(overview.data.purchasing.purchaseReceipts ?? "0", currency)} /><Metric label="Quantity Received" value={formatQuantity(overview.data.purchasing.quantityReceived ?? "0")} /></dl>
          {overview.data.purchasing.receiptCount === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No Purchase Receipts were recorded in this period.</p>}
          <p className="text-xs text-muted-foreground">Purchase Receipts represent stock received; they are reported separately from expenses.</p>
          <Button asChild size="sm" variant="outline"><Link to="/purchasing/history">View Purchasing history</Link></Button>
        </>}
      </section>}

      {hasFinanceAccess && <FinanceSection currency={currency} summary={finance} />}
    </div>
  </section>
}

const inputClass = "h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"

const toneCardClass = {
  neutral: "border-border",
  warning: "border-warning/30 bg-warning/[0.04]",
  destructive: "border-destructive/25 bg-destructive/[0.04]",
} as const

function CountCard({ label, value, to, tone = "neutral" }: { label: string; value: number; to: string; tone?: "neutral" | "warning" | "destructive" }) {
  const toneTextClass = tone === "warning" ? "text-warning-foreground" : tone === "destructive" ? "text-destructive" : "text-foreground"
  return <Link aria-label={`${label}: ${value}`} className={`group rounded-lg border bg-card p-4 outline-none transition-all duration-150 hover:border-border-strong hover:shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${toneCardClass[tone]}`} to={to}>
    <span className="flex items-center justify-between text-sm text-muted-foreground">{label}<span aria-hidden="true" className="text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">→</span></span>
    <span className={`mt-1.5 block text-2xl font-semibold tabular-nums ${toneTextClass}`}>{value.toLocaleString()}</span>
  </Link>
}

function Metric({ label, value, help }: { label: string; value: string; help?: string }) {
  return <div className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-xs"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-2 break-all text-2xl font-semibold tabular-nums">{value}</dd>{help && <p className="mt-1.5 text-xs text-muted-foreground">{help}</p>}</div>
}

function TopProducts({ products }: { products: { productId: string; productName: string; productSku: string; unitsSold: string }[] }) {
  return <section aria-labelledby="top-products-title" className="rounded-lg border border-border"><h3 className="border-b border-border px-4 py-3 font-semibold" id="top-products-title">Top Products by Units Sold</h3>{products.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No product sales in this period.</p> : <ol className="divide-y divide-border">{products.map((product) => <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" key={product.productId}><div className="min-w-0"><p className="break-words font-medium">{product.productName}</p><p className="text-xs text-muted-foreground">SKU {product.productSku}</p></div><p className="shrink-0 text-sm tabular-nums">{formatQuantity(product.unitsSold)} units</p></li>)}</ol>}</section>
}

function FinanceSection({ summary, currency }: { summary: ReturnType<typeof useFinancialSummary>; currency: string }) {
  return <section aria-labelledby="finance-summary-title" className="space-y-4 pt-8">
    <SectionHeader id="finance-summary-title" title="Estimated financial overview" />
    {summary.isLoading && <LoadingState label="Loading Finance summary…" />}
    {summary.isError && <ErrorState onRetry={() => void summary.refetch()} title="Finance summary unavailable">Operational inventory and activity remain available. Finance data could not be loaded.</ErrorState>}
    {summary.data && <>
      {summary.data.saleCount === 0 && summary.data.operatingExpenses === "0.0000" && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No Sales or operating expenses were recorded in this period.</p>}
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

function estimatedMoney(value: string | null, complete: boolean, currency: string) {
  return complete && value !== null ? formatExpenseMoney(value, currency) : "Unavailable"
}

function plural(value: number, singular: string, pluralForm: string) { return value === 1 ? singular : pluralForm }
