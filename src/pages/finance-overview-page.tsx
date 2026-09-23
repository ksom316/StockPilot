import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { PageHeader, SectionHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { ErrorState, LoadingState } from "@/components/ui/state"
import { FinanceSectionNav } from "@/components/finance/finance-section-nav"
import { useBusiness } from "@/features/business/business-context"
import { formatExpenseMoney } from "@/features/finance/finance-money"
import { type FinancePeriod, getFinanceDateRange } from "@/features/finance/finance-period"
import { useFinancialSummary } from "@/features/finance/finance-queries"
import type { FinancialSummary } from "@/features/finance/finance-types"

export function FinanceOverviewPage() {
  const { business } = useBusiness()
  const [period, setPeriod] = useState<FinancePeriod>("month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const range = useMemo(() => getFinanceDateRange(period, business?.timezone ?? "UTC", new Date(), customStart, customEnd), [period, business?.timezone, customStart, customEnd])
  const summary = useFinancialSummary(range)
  const currency = business?.currency ?? "USD"
  const canShowEstimatedValues = Boolean(summary.data?.costCoverageComplete)

  return <section className="space-y-6">
    <FinanceSectionNav />
    <PageHeader actions={<Button asChild variant="outline"><Link to="/finance/expenses">Manage Expenses</Link></Button>} description="Recorded sales, operating expenses, and estimated profitability for your business." eyebrow="Finance" title="Overview" />

    <section aria-label="Financial period" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-4 text-sm">
      <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Period</span><select className={inputClass} onChange={(event) => setPeriod(event.target.value as FinancePeriod)} value={period}><option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option><option value="custom">Custom</option></select></label>
      {period === "custom" && <>
        <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Start date</span><input className={inputClass} onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></label>
        <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">End date</span><input className={inputClass} onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></label>
      </>}
      {range && <span className="text-muted-foreground">Business dates: {range.startDate} – {range.endDate}</span>}
    </section>
    {period === "custom" && !range && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">Choose valid start and end dates. The start date must be on or before the end date.</p>}
    {period !== "custom" && !range && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">The workspace timezone is invalid, so this date range can’t be loaded. Contact your workspace owner to correct it.</p>}

    {summary.isLoading && <LoadingState className="rounded-lg border border-border bg-card p-10 text-center" label="Loading financial summary…" />}
    {summary.isError && <ErrorState onRetry={() => void summary.refetch()} title="Financial summary unavailable">We couldn’t load this period’s summary. Your saved records are unchanged.</ErrorState>}

    {summary.data && business && <>
      {summary.data.saleCount === 0 && summary.data.operatingExpenses === "0.0000" && (summary.data.purchaseReceipts === null || summary.data.purchaseReceipts === "0.0000") && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No sales, expenses, or stock receipts were recorded in this period.</p>}
      {summary.data.saleCount === 0 && (summary.data.operatingExpenses !== "0.0000" || (summary.data.purchaseReceipts !== null && summary.data.purchaseReceipts !== "0.0000")) && <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No sales were recorded in this period. Operating expenses and stock receipts, if any, are shown separately below.</p>}
      {!summary.data.costCoverageComplete && <div aria-live="polite" className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-4" role="status"><h2 className="font-medium">Estimated profitability is incomplete</h2><p className="mt-1 text-sm text-muted-foreground">Some sales in this period do not have a recorded estimated cost basis, so complete profit estimates cannot be calculated.</p><p className="mt-2 text-sm font-medium">Cost basis recorded for {summary.data.costedSaleItemCount} of {summary.data.saleItemCount} sale items · {summary.data.missingCostSaleItemCount} missing</p></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Recorded Sales" value={formatExpenseMoney(summary.data.recordedSales, currency)} help={`${summary.data.saleCount} ${summary.data.saleCount === 1 ? "sale" : "sales"} recorded`} />
        <Metric label="Estimated Gross Profit" value={estimatedMoney(summary.data.estimatedGrossProfit, canShowEstimatedValues, currency)} help={canShowEstimatedValues ? "Sales less estimated product cost" : "Unavailable until all sale items have a cost basis"} />
        <Metric label="Operating Expenses" value={formatExpenseMoney(summary.data.operatingExpenses, currency)} help="Non-void expenses in this period" />
        <Metric label="Estimated Net Profit" value={estimatedMoney(summary.data.estimatedNetProfit, canShowEstimatedValues, currency)} help={canShowEstimatedValues ? "Estimated gross profit less operating expenses" : "Unavailable until all sale items have a cost basis"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
        <section aria-labelledby="profit-breakdown-title" className="rounded-lg border border-border bg-card p-5">
          <SectionHeader id="profit-breakdown-title" title="Estimated performance" />
          <dl className="mt-4 divide-y divide-border">{breakdownRows(summary.data, currency).map((row) => <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" key={row.label}><dt className={row.emphasize ? "font-semibold" : "text-sm text-muted-foreground"}>{row.label}</dt><dd className={`shrink-0 text-right tabular-nums ${row.emphasize ? "font-semibold" : "text-sm"}`}>{row.value}</dd></div>)}</dl>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-sm"><p><span className="text-muted-foreground">Estimated Gross Margin</span><span className="ml-2 font-medium">{canShowEstimatedValues ? formatMargin(summary.data.estimatedGrossMargin) : "Unavailable"}</span></p><p><span className="text-muted-foreground">Estimated Net Margin</span><span className="ml-2 font-medium">{canShowEstimatedValues ? formatMargin(summary.data.estimatedNetMargin) : "Unavailable"}</span></p></div>
        </section>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Estimated Product Cost</p><p className="mt-2 break-all text-2xl font-semibold tabular-nums">{estimatedMoney(summary.data.estimatedProductCost, canShowEstimatedValues, currency)}</p><p className="mt-1 text-xs text-muted-foreground">Latest/default product costs captured when each sale was recorded.</p></div>
          {summary.data.purchaseReceipts !== null && <div className="rounded-lg border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Purchase Receipts</p><p className="mt-2 break-all text-2xl font-semibold tabular-nums">{formatExpenseMoney(summary.data.purchaseReceipts, currency)}</p><p className="mt-1 text-xs text-muted-foreground">Stock received during the selected period. Reported separately from Operating Expenses and not subtracted from profit.</p></div>}
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Profit estimates use the latest/default product cost known at the time each sale was recorded. They are business-performance estimates, not accounting statements.</p>
    </>}
  </section>
}

const inputClass = "h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"

function Metric({ label, value, help }: { label: string; value: string; help: string }) {
  return <article className="min-w-0 rounded-lg border border-border bg-card p-5"><h2 className="text-sm font-medium text-muted-foreground">{label}</h2><p className="mt-3 break-all text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{help}</p></article>
}

function estimatedMoney(value: string | null, coverageComplete: boolean, currency: string) {
  return coverageComplete && value !== null ? formatExpenseMoney(value, currency) : "Unavailable"
}

function formatMargin(value: string | null) { return value === null ? "Unavailable" : `${value}%` }

function breakdownRows(summary: FinancialSummary, currency: string) {
  return [
    { label: "Recorded Sales", value: formatExpenseMoney(summary.recordedSales, currency) },
    { label: "Estimated Product Cost", value: estimatedMoney(summary.estimatedProductCost, summary.costCoverageComplete, currency) },
    { label: "Estimated Gross Profit", value: estimatedMoney(summary.estimatedGrossProfit, summary.costCoverageComplete, currency), emphasize: true },
    { label: "Operating Expenses", value: formatExpenseMoney(summary.operatingExpenses, currency) },
    { label: "Estimated Net Profit", value: estimatedMoney(summary.estimatedNetProfit, summary.costCoverageComplete, currency), emphasize: true },
  ]
}
