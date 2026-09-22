import { useMemo } from "react"
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { DailySalesPoint, InventoryOverview } from "@/features/analytics/analytics-types"
import { formatExpenseMoney } from "@/features/finance/finance-money"

const stockColors = ["#16a34a", "#d97706", "#dc2626"]

export function RecordedSalesTrend({ points, currency }: { points: DailySalesPoint[]; currency: string }) {
  const chartData = useMemo(() => points.map((point) => ({
    ...point,
    // This numeric coordinate is for plotting only. The canonical exact decimal string remains
    // on each point and is used for all visible money values; it is never used for business math.
    chartValue: Number(point.recordedSales),
    label: formatBusinessDate(point.date),
  })), [points])

  if (!points.some((point) => point.saleCount > 0)) return <section aria-labelledby="recorded-sales-trend-title" className="rounded-lg border p-4">
    <h3 className="font-semibold" id="recorded-sales-trend-title">Recorded Sales Trend</h3>
    <p className="mt-2 text-sm text-muted-foreground">No recorded sales in this period.</p>
  </section>

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 6) - 1)
  return <section aria-describedby="recorded-sales-trend-description" aria-labelledby="recorded-sales-trend-title" className="min-w-0 rounded-lg border p-4">
    <h3 className="font-semibold" id="recorded-sales-trend-title">Recorded Sales Trend</h3>
    <p className="mt-1 text-xs text-muted-foreground" id="recorded-sales-trend-description">Daily Recorded Sales for the selected business dates.</p>
    <ul className="sr-only">{chartData.map((point) => <li key={point.date}>{formatBusinessDate(point.date)}: {formatExpenseMoney(point.recordedSales, currency)} Recorded Sales, {point.saleCount} {point.saleCount === 1 ? "sale" : "sales"}</li>)}</ul>
    <div aria-label="Line chart of daily Recorded Sales" className="mt-3 h-52 min-w-0 w-full" role="img">
      <ResponsiveContainer height="100%" minWidth={0} width="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" interval={tickInterval} tickFormatter={formatBusinessDate} minTickGap={12} tick={{ fontSize: 11 }} />
          <YAxis width={56} tick={{ fontSize: 11 }} tickFormatter={(value: number) => compactMoney(value, currency)} />
          <Tooltip labelFormatter={(value) => formatBusinessDate(String(value))} formatter={(_value, _name, item) => [formatExpenseMoney(String(item.payload.recordedSales), currency), "Recorded Sales"]} />
          <Line dataKey="chartValue" name="Recorded Sales" type="monotone" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </section>
}

export function InventoryStatus({ inventory }: { inventory: InventoryOverview }) {
  if (inventory.activeProducts === 0) return <section aria-labelledby="inventory-status-title" className="rounded-lg border p-4">
    <h3 className="font-semibold" id="inventory-status-title">Inventory Status</h3>
    <p className="mt-2 text-sm text-muted-foreground">No active products to show.</p>
  </section>

  // Analytics defines out-of-stock as quantity = 0 and low-stock as quantity > 0 and <= threshold,
  // so the states are disjoint and the remainder is safely labeled In Stock.
  const values = [
    { name: "In Stock", value: inventory.activeProducts - inventory.lowStockProducts - inventory.outOfStockProducts },
    { name: "Low Stock", value: inventory.lowStockProducts },
    { name: "Out of Stock", value: inventory.outOfStockProducts },
  ].filter((item) => item.value > 0)

  return <section aria-describedby="inventory-status-description" aria-labelledby="inventory-status-title" className="min-w-0 rounded-lg border p-4">
    <h3 className="font-semibold" id="inventory-status-title">Inventory Status</h3>
    <p className="mt-1 text-xs text-muted-foreground" id="inventory-status-description">Current stock status; not limited to the selected period.</p>
    <div className="mt-2 grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div aria-label="Chart of current inventory status" className="h-36 min-w-0 w-full" role="img">
        <ResponsiveContainer height="100%" minWidth={0} width="100%">
          <PieChart><Pie data={values} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={2}>
            {values.map((entry) => <Cell key={entry.name} fill={stockColors[entry.name === "In Stock" ? 0 : entry.name === "Low Stock" ? 1 : 2]} />)}
          </Pie><Tooltip formatter={(value, name) => [Number(value).toLocaleString(), name]} /></PieChart>
        </ResponsiveContainer>
      </div>
      <ul aria-label="Inventory status counts" className="space-y-1 text-sm">
        {["In Stock", "Low Stock", "Out of Stock"].map((name) => {
          const value = name === "In Stock" ? inventory.activeProducts - inventory.lowStockProducts - inventory.outOfStockProducts : name === "Low Stock" ? inventory.lowStockProducts : inventory.outOfStockProducts
          return <li className="flex min-w-28 justify-between gap-4" key={name}><span>{name}</span><span className="font-medium tabular-nums">{value.toLocaleString()}</span></li>
        })}
      </ul>
    </div>
  </section>
}

function formatBusinessDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

function compactMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return ""
  return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value)
}
