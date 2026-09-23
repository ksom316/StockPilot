import { Download, Printer } from "lucide-react"
import { useMemo, useState } from "react"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state"
import { Table, TableBody, TableContainer, TableHead, Td, Th } from "@/components/ui/table"
import { useBusiness } from "@/features/business/business-context"
import { getReportDateRange, type ReportPeriodPreset } from "@/features/reports/report-period"
import { useReport } from "@/features/reports/report-queries"
import { downloadCsv, toCsv } from "@/features/reports/report-csv"
import type { ReportType } from "@/features/reports/report-types"

const labels: Record<ReportType, string> = { inventory: "Inventory Report", inventory_movements: "Inventory Movement Report", sales: "Sales Report", purchasing: "Purchasing Report", expenses: "Expenses & Profitability Report" }
const presets: Array<[ReportPeriodPreset, string]> = [["today", "Today"], ["yesterday", "Yesterday"], ["this_week", "This week"], ["last_week", "Last week"], ["this_month", "This month"], ["last_month", "Last month"], ["last_30_days", "Last 30 days"], ["last_90_days", "Last 90 days"], ["custom", "Custom"]]
const inputClass = "h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"

export function ReportsPage() {
  const { business, enabledModules, role } = useBusiness()
  const available = useMemo<ReportType[]>(() => [
    "inventory",
    "inventory_movements",
    ...(enabledModules.includes("sales") && ["owner", "manager", "employee"].includes(role ?? "") ? ["sales" as const] : []),
    ...(enabledModules.includes("purchasing") && ["owner", "manager", "employee"].includes(role ?? "") ? ["purchasing" as const] : []),
    ...(enabledModules.includes("expenses") && ["owner", "manager"].includes(role ?? "") ? ["expenses" as const] : []),
  ], [enabledModules, role])
  const [type, setType] = useState<ReportType>("inventory")
  const [preset, setPreset] = useState<ReportPeriodPreset>("this_month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [page, setPage] = useState(1)
  const selectedType = available.includes(type) ? type : (available[0] ?? "inventory")
  const range = useMemo(() => getReportDateRange(preset, business?.timezone ?? "UTC", new Date(), customStart, customEnd), [business?.timezone, customEnd, customStart, preset])
  const report = useReport(selectedType, range, available.includes(selectedType), page)
  const columns = report.data?.rows[0] ? Object.keys(report.data.rows[0]).map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()), text: !["itemCount", "totalRows"].includes(key) })) : []
  const exportReport = () => {
    if (!report.data) return
    const csv = toCsv(columns, report.data.rows)
    downloadCsv(`stockpilot-${selectedType}-${report.data.startDate}-to-${report.data.endDate}.csv`, csv)
  }
  const totalPages = report.data ? Math.ceil(report.data.totalRows / report.data.pageSize) : 0

  return (
    <section className="space-y-6 print:space-y-3">
      <PageHeader
        actions={<div className="flex gap-2 print:hidden"><Button disabled={!report.data} onClick={exportReport} variant="outline"><Download aria-hidden="true" className="mr-2 size-4" />CSV</Button><Button onClick={() => window.print()} variant="outline"><Printer aria-hidden="true" className="mr-2 size-4" />Print</Button></div>}
        description="Bounded reports from recorded StockPilot data."
        eyebrow="Operational reporting"
        title="Reports"
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm print:hidden">
        <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Report</span><select aria-label="Report type" className={inputClass} onChange={(event) => { setType(event.target.value as ReportType); setPage(1) }} value={type}>{available.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></label>
        <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Period</span><select aria-label="Report period" className={inputClass} onChange={(event) => { setPreset(event.target.value as ReportPeriodPreset); setPage(1) }} value={preset}>{presets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {preset === "custom" && <>
          <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">Start date</span><input aria-label="Report start date" className={inputClass} onChange={(event) => { setCustomStart(event.target.value); setPage(1) }} type="date" value={customStart} /></label>
          <label className="flex items-center gap-2"><span className="font-medium text-muted-foreground">End date</span><input aria-label="Report end date" className={inputClass} onChange={(event) => { setCustomEnd(event.target.value); setPage(1) }} type="date" value={customEnd} /></label>
        </>}
        {range && <span className="ml-auto text-muted-foreground">Business dates: <span className="font-medium text-foreground">{range.startDate} – {range.endDate}</span></span>}
      </div>
      <div className="hidden print:block"><p className="text-sm text-muted-foreground">{business?.name} · {range ? `${range.startDate} – ${range.endDate}` : "Invalid period"} · Generated {new Date().toLocaleString()}</p></div>
      {!range && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">Choose a valid date range. Custom ranges must be ordered, cannot include future dates, and are limited to 366 calendar days.</p>}
      {report.isLoading && <LoadingState className="rounded-lg border border-border bg-card p-8 text-center" label="Loading report…" />}
      {report.isError && <ErrorState onRetry={() => void report.refetch()} title="Report unavailable">{report.error.message}</ErrorState>}
      {report.data && <>
        <div className="print-report-header space-y-1 border-b border-border pb-4"><p className="text-sm font-medium text-primary">{labels[type]}</p><h2 className="text-xl font-semibold tracking-tight">{business?.name}</h2><p className="text-sm text-muted-foreground">Business dates: {report.data.startDate} – {report.data.endDate}</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(report.data.summary).map(([key, value]) => <div className="rounded-lg border border-border bg-card p-4 shadow-xs" key={key}><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</p><p className="mt-2 break-all text-xl font-semibold tabular-nums">{value === null ? "Unavailable" : String(value)}</p></div>)}</div>
        {report.data.rows.length === 0 ? <EmptyState description="No data was recorded for this business in the selected period." title="No recorded data in this period" /> : (
          <TableContainer>
            <Table>
              <TableHead><tr>{columns.map((column) => <Th key={column.key}>{column.label}</Th>)}</tr></TableHead>
              <TableBody>{report.data.rows.map((row, index) => <tr key={index}>{columns.map((column) => <Td className="max-w-xs" key={column.key}>{row[column.key] === null ? "—" : String(row[column.key])}</Td>)}</tr>)}</TableBody>
            </Table>
          </TableContainer>
        )}
        {totalPages > 1 && <div className="flex items-center justify-between print:hidden">
          <p className="text-sm text-muted-foreground">Showing page {report.data.page} of {totalPages}</p>
          <div className="flex gap-2"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} variant="outline">Previous</Button><Button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} variant="outline">Next</Button></div>
        </div>}
      </>}
    </section>
  )
}
