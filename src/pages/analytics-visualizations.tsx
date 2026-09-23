import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { ReactNode } from "react"
import type { AnalyticsProductPoint, AnalyticsTrendPoint } from "@/features/analytics/analytics-workspace-types"
import { formatExpenseMoney } from "@/features/finance/finance-money"

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}
function compactMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return ""
  return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value)
}
function chartPoints(points: AnalyticsTrendPoint[], key: "recordedSales" | "purchaseReceipts" | "estimatedGrossProfit" | "operatingExpenses" | "estimatedNetProfit") {
  return points.map((point) => ({ ...point, chartValue: point[key] == null ? null : Number(point[key]), label: dateLabel(point.date) }))
}
function tickInterval(length: number) { return Math.max(0, Math.ceil(length / 6) - 1) }

export function AnalyticsSalesTrend({ points, currency }: { points: AnalyticsTrendPoint[]; currency: string }) {
  if (!points.some((point) => (point.saleCount ?? 0) > 0)) return <EmptyChart title="Recorded Sales Trend" message="No Recorded Sales in this period." />
  const data = chartPoints(points, "recordedSales")
  return <ChartFrame title="Recorded Sales Trend" description="Recorded Sales revenue by business-local date." items={data.map((point) => `${point.label}: ${formatExpenseMoney(point.recordedSales ?? "0", currency)}, ${point.saleCount ?? 0} sales`)}>
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" interval={tickInterval(data.length)} tickFormatter={dateLabel} minTickGap={12} tick={{ fontSize: 11 }} /><YAxis width={58} tick={{ fontSize: 11 }} tickFormatter={(value: number) => compactMoney(value, currency)} /><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(_value, _name, item) => [formatExpenseMoney(String(item.payload.recordedSales), currency), "Recorded Sales"]} /><Line dataKey="chartValue" name="Recorded Sales" stroke="#16a34a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart>
  </ChartFrame>
}

export function AnalyticsTopProducts({ products, currency, metric }: { products: AnalyticsProductPoint[]; currency: string; metric: "revenue" | "units" }) {
  const source = metric === "revenue" ? products : products
  if (source.length === 0) return <EmptyChart title="Top Products" message="More recorded activity is needed to show top products." />
  const data = source.slice(0, 10).map((product) => ({ ...product, value: Number(metric === "revenue" ? product.recordedSales : product.unitsSold), label: product.productName }))
  return <ChartFrame title="Top Products" description={metric === "revenue" ? "Ranked by Recorded Sales revenue." : "Ranked by recorded units sold."} items={data.map((item) => `${item.productName}: ${metric === "revenue" ? formatExpenseMoney(item.recordedSales, currency) : `${item.unitsSold} units`}`)}>
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(value: number) => metric === "revenue" ? compactMoney(value, currency) : value.toLocaleString()} /><YAxis dataKey="label" type="category" width={92} tick={{ fontSize: 11 }} tickFormatter={(value: string) => value.length > 16 ? `${value.slice(0, 16)}…` : value} /><Tooltip formatter={(_value, _name, item) => [metric === "revenue" ? formatExpenseMoney(item.payload.recordedSales, currency) : `${item.payload.unitsSold} units`, metric === "revenue" ? "Recorded Sales" : "Units Sold"]} /><Bar dataKey="value" fill="#16a34a" radius={[0, 3, 3, 0]} /></BarChart>
  </ChartFrame>
}

export function AnalyticsPurchasingTrend({ points, currency }: { points: AnalyticsTrendPoint[]; currency: string }) {
  if (!points.some((point) => (point.receiptCount ?? 0) > 0)) return <EmptyChart title="Recorded Purchasing Trend" message="No Recorded Purchasing in this period." />
  const data = chartPoints(points, "purchaseReceipts")
  return <ChartFrame title="Recorded Purchasing Trend" description="Recorded Purchasing Spend by business-local date." items={data.map((point) => `${point.label}: ${formatExpenseMoney(point.purchaseReceipts ?? "0", currency)}, ${point.receiptCount ?? 0} receipts`)}>
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" interval={tickInterval(data.length)} tickFormatter={dateLabel} minTickGap={12} tick={{ fontSize: 11 }} /><YAxis width={58} tick={{ fontSize: 11 }} tickFormatter={(value: number) => compactMoney(value, currency)} /><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(_value, _name, item) => [formatExpenseMoney(String(item.payload.purchaseReceipts), currency), "Recorded Purchasing Spend"]} /><Line dataKey="chartValue" name="Recorded Purchasing Spend" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart>
  </ChartFrame>
}

export function AnalyticsProfitabilityTrend({ points, currency }: { points: AnalyticsTrendPoint[]; currency: string }) {
  const complete = points.some((point) => point.estimatedGrossProfit !== null && point.estimatedGrossProfit !== undefined)
  if (!complete) return <EmptyChart title="Estimated Profitability Trend" message="More recorded activity with cost coverage is needed to show this trend." />
  const data = points.map((point) => ({ ...point, gross: point.estimatedGrossProfit == null ? null : Number(point.estimatedGrossProfit), expenses: Number(point.operatingExpenses ?? "0"), net: point.estimatedNetProfit == null ? null : Number(point.estimatedNetProfit) }))
  return <ChartFrame title="Estimated Profitability Trend" description="Estimated figures only; not accounting statements." items={data.map((point) => `${dateLabel(point.date)}: ${point.gross == null ? "unavailable" : formatExpenseMoney(String(point.gross), currency)} estimated gross profit, ${formatExpenseMoney(String(point.expenses), currency)} expenses, ${point.net == null ? "unavailable" : formatExpenseMoney(String(point.net), currency)} estimated net profit`)}>
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" interval={tickInterval(data.length)} tickFormatter={dateLabel} minTickGap={12} tick={{ fontSize: 11 }} /><YAxis width={64} tick={{ fontSize: 11 }} tickFormatter={(value: number) => compactMoney(value, currency)} /><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(value, name) => [formatExpenseMoney(String(value ?? "0"), currency), name]} /><Legend /><Line connectNulls={false} dataKey="gross" name="Estimated Gross Profit" stroke="#16a34a" strokeWidth={2} dot={false} /><Line connectNulls={false} dataKey="expenses" name="Recorded Expenses" stroke="#d97706" strokeWidth={2} dot={false} /><Line connectNulls={false} dataKey="net" name="Estimated Net Profit" stroke="#2563eb" strokeWidth={2} dot={false} /></LineChart>
  </ChartFrame>
}

export function AnalyticsSalesPurchasingComparison({ sales, purchasing, currency }: { sales: AnalyticsTrendPoint[]; purchasing: AnalyticsTrendPoint[]; currency: string }) {
  const hasActivity = sales.some((point) => (point.saleCount ?? 0) > 0) || purchasing.some((point) => (point.receiptCount ?? 0) > 0)
  if (!hasActivity) return <EmptyChart title="Recorded Sales vs Purchasing" message="More recorded activity is needed to show this comparison." />
  const purchaseByDate = new Map(purchasing.map((point) => [point.date, point]))
  const data = sales.map((point) => ({ date: point.date, sales: Number(point.recordedSales ?? "0"), purchasing: Number(purchaseByDate.get(point.date)?.purchaseReceipts ?? "0") }))
  return <ChartFrame title="Recorded Sales vs Purchasing" description="Comparison only; the difference is not profit." items={data.map((point) => `${dateLabel(point.date)}: ${formatExpenseMoney(String(point.sales), currency)} Recorded Sales, ${formatExpenseMoney(String(point.purchasing), currency)} Recorded Purchasing Spend`)}>
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" interval={tickInterval(data.length)} tickFormatter={dateLabel} minTickGap={12} tick={{ fontSize: 11 }} /><YAxis width={58} tick={{ fontSize: 11 }} tickFormatter={(value: number) => compactMoney(value, currency)} /><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(value, name) => [formatExpenseMoney(String(value ?? "0"), currency), name]} /><Legend /><Line dataKey="sales" name="Recorded Sales" stroke="#16a34a" strokeWidth={2} dot={false} /><Line dataKey="purchasing" name="Recorded Purchasing Spend" stroke="#2563eb" strokeWidth={2} dot={false} /></LineChart>
  </ChartFrame>
}

function ChartFrame({ title, description, items, children }: { title: string; description: string; items: string[]; children: ReactNode }) {
  return <section aria-describedby={`${title}-description`} aria-labelledby={`${title}-title`} className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"><h3 className="font-semibold" id={`${title}-title`}>{title}</h3><p className="mt-1 text-xs text-muted-foreground" id={`${title}-description`}>{description}</p><ul className="sr-only">{items.map((item) => <li key={item}>{item}</li>)}</ul><div aria-label={`${title} chart`} className="mt-4 h-64 min-w-0 w-full" role="img"><ResponsiveContainer height="100%" minWidth={0} width="100%">{children}</ResponsiveContainer></div></section>
}

function EmptyChart({ title, message }: { title: string; message: string }) {
  return <section aria-labelledby={`${title}-title`} className="rounded-xl border border-dashed border-border bg-card p-5"><h3 className="font-semibold" id={`${title}-title`}>{title}</h3><p className="mt-2 text-sm text-muted-foreground">{message}</p></section>
}
