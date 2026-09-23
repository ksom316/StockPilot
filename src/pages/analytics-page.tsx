import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { PageHeader, SectionHeader } from "@/components/layout/page-header"
import { ErrorState, LoadingState } from "@/components/ui/state"
import { Button } from "@/components/ui/button"
import { useBusiness } from "@/features/business/business-context"
import { useBusinessOverview } from "@/features/analytics/analytics-queries"
import { useAnalyticsWorkspace } from "@/features/analytics/analytics-workspace-queries"
import { getAnalyticsDateRange, type AnalyticsPeriod } from "@/features/analytics/analytics-period"
import { formatExpenseMoney } from "@/features/finance/finance-money"
import { useFinancialSummary } from "@/features/finance/finance-queries"
import { AnalyticsProfitabilityTrend, AnalyticsPurchasingTrend, AnalyticsSalesPurchasingComparison, AnalyticsSalesTrend, AnalyticsTopProducts } from "@/pages/analytics-visualizations"
import { InventoryStatus } from "@/pages/dashboard-visualizations"

const financeRoles = ["owner", "manager"]
const purchasingRoles = ["owner", "manager", "employee"]

export function AnalyticsPage() {
  const { business, role, enabledModules, isLoading: isBusinessLoading } = useBusiness()
  const [period, setPeriod] = useState<AnalyticsPeriod>("month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [productMetric, setProductMetric] = useState<"revenue" | "units">("revenue")
  const range = useMemo(() => business ? getAnalyticsDateRange(period, business.timezone, new Date(), customStart, customEnd) : null, [business, customEnd, customStart, period])
  const hasSales = enabledModules.includes("sales")
  const hasPurchasingAccess = Boolean(enabledModules.includes("purchasing") && role && purchasingRoles.includes(role))
  const hasFinanceAccess = Boolean(enabledModules.includes("expenses") && role && financeRoles.includes(role))
  const overview = useBusinessOverview(range)
  const workspace = useAnalyticsWorkspace(range)
  const finance = useFinancialSummary(range, hasFinanceAccess)
  const currency = business?.currency ?? "USD"

  if (isBusinessLoading || !business) return <LoadingState className="rounded-xl border border-border bg-card p-8 text-center" label="Loading Analytics workspace…" />
  return <section className="space-y-6">
    <PageHeader description="Understand performance and trends across your business." eyebrow="Analytics" title="Business Analytics" />

    <section aria-label="Analytics period controls" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <label className="min-w-44 flex-1 space-y-1.5 text-sm sm:flex-none"><span className="font-medium">Period</span><select aria-label="Analytics period" className={inputClass} onChange={(event) => setPeriod(event.target.value as AnalyticsPeriod)} value={period}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This week</option><option value="last_week">Last week</option><option value="month">This month</option><option value="last_month">Last month</option><option value="last_30">Last 30 completed days</option><option value="last_90">Last 90 completed days</option><option value="custom">Custom range</option></select></label>
      {period === "custom" && <><label className="min-w-40 flex-1 space-y-1.5 text-sm sm:flex-none"><span className="font-medium">Start date</span><input aria-label="Analytics start date" className={inputClass} onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label><label className="min-w-40 flex-1 space-y-1.5 text-sm sm:flex-none"><span className="font-medium">End date</span><input aria-label="Analytics end date" className={inputClass} onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label></>}
      {range && <p className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">Business dates: <span className="font-medium text-foreground">{range.startDate} – {range.endDate}</span></p>}
    </section>
    {!range && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">Choose valid business-local dates in order. Custom ranges cannot include future dates or more than 366 calendar days.</p>}

    {overview.isLoading || workspace.isLoading ? <LoadingState label="Loading Analytics…" /> : overview.isError || workspace.isError ? <ErrorState onRetry={() => { void overview.refetch(); void workspace.refetch() }} title="Analytics unavailable">We couldn't load this workspace's analytics for the selected period.</ErrorState> : overview.data && workspace.data && <>
      <section aria-labelledby="analytics-summary-title" className="space-y-3"><SectionHeader description="Concise metrics for the selected business-local period." id="analytics-summary-title" title="Performance summary" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active Products" value={overview.data.inventory.activeProducts.toLocaleString()} /><Metric label="Low Stock" value={overview.data.inventory.lowStockProducts.toLocaleString()} /><Metric label="Out of Stock" value={overview.data.inventory.outOfStockProducts.toLocaleString()} />{hasSales && overview.data.sales.enabled && <Metric label="Recorded Sales" value={formatExpenseMoney(overview.data.sales.recordedSales, currency)} help={`${overview.data.sales.saleCount} recorded ${overview.data.sales.saleCount === 1 ? "sale" : "sales"}`} />}{hasPurchasingAccess && overview.data.purchasing.available && <Metric label="Recorded Purchasing" value={formatExpenseMoney(overview.data.purchasing.purchaseReceipts ?? "0", currency)} help={`${overview.data.purchasing.receiptCount ?? 0} recorded receipts`} />}{hasFinanceAccess && finance.data && <Metric label="Estimated Net Profit" value={finance.data.estimatedNetProfit === null ? "Unavailable" : formatExpenseMoney(finance.data.estimatedNetProfit, currency)} help="Estimated, not accounting-grade" />}</div></section>

      <section aria-labelledby="inventory-analytics-title" className="space-y-3"><SectionHeader actions={<Button asChild size="sm" variant="outline"><Link to="/inventory">View inventory</Link></Button>} description="Current inventory condition, independent of the selected period." id="inventory-analytics-title" title="Inventory status" /><InventoryStatus inventory={overview.data.inventory} /></section>

      {hasSales && workspace.data.sales.enabled && <section aria-labelledby="sales-analytics-title" className="space-y-4"><SectionHeader actions={<label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Rank by</span><select aria-label="Top products metric" className={smallInputClass} onChange={(event) => setProductMetric(event.target.value as "revenue" | "units")} value={productMetric}><option value="revenue">Recorded Sales</option><option value="units">Units sold</option></select></label>} description="Recorded Sales activity and product contribution." id="sales-analytics-title" title="Sales performance" /><div className="grid gap-4 xl:grid-cols-2"><AnalyticsSalesTrend currency={currency} points={workspace.data.sales.dailyTrend} /><AnalyticsTopProducts currency={currency} metric={productMetric} products={productMetric === "revenue" ? workspace.data.sales.topProductsByRevenue : workspace.data.sales.topProductsByUnits} /></div></section>}

      {hasPurchasingAccess && workspace.data.purchasing.available && <section aria-labelledby="purchasing-analytics-title" className="space-y-4"><SectionHeader description="Recorded Purchasing Spend and receipts by business-local date." id="purchasing-analytics-title" title="Purchasing performance" /><AnalyticsPurchasingTrend currency={currency} points={workspace.data.purchasing.dailyTrend} /></section>}

      {hasFinanceAccess && workspace.data.finance.enabled && <section aria-labelledby="finance-analytics-title" className="space-y-4"><SectionHeader description="Estimated profitability using the existing Finance cost basis. These are not accounting statements." id="finance-analytics-title" title="Estimated profitability" /><AnalyticsProfitabilityTrend currency={currency} points={workspace.data.finance.dailyTrend} /></section>}

      {hasSales && hasPurchasingAccess && workspace.data.sales.enabled && workspace.data.purchasing.available && <section aria-labelledby="comparison-analytics-title" className="space-y-4"><SectionHeader description="A comparison of activity over time; the difference is not profit." id="comparison-analytics-title" title="Recorded Sales vs Purchasing" /><AnalyticsSalesPurchasingComparison currency={currency} purchasing={workspace.data.purchasing.dailyTrend} sales={workspace.data.sales.dailyTrend} /></section>}
    </>}
  </section>
}

function Metric({ label, value, help }: { label: string; value: string; help?: string }) { return <div className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-xs"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 break-all text-2xl font-semibold tabular-nums">{value}</p>{help && <p className="mt-1.5 text-xs text-muted-foreground">{help}</p>}</div> }

const inputClass = "h-10 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
const smallInputClass = "h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
