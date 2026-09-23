import { useMemo, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/page-header"
import { useBusiness } from "@/features/business/business-context"
import { AnalystDataError, analystErrorMessage, analystPeriods, type AnalystPeriod, type AnalystResponse } from "@/features/analyst/analyst-types"
import { askAnalyst } from "@/features/analyst/analyst-service"

const periodLabels: Record<AnalystPeriod, string> = {
  TODAY: "Today",
  THIS_WEEK: "This week",
  THIS_MONTH: "This month",
  LAST_30_COMPLETED_DAYS: "Last 30 completed days",
}

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"

export function AnalystPage() {
  const { business, enabledModules } = useBusiness()
  const [period, setPeriod] = useState<AnalystPeriod>("THIS_MONTH")
  const [question, setQuestion] = useState("")
  const [result, setResult] = useState<AnalystResponse | null>(null)
  const [error, setError] = useState<AnalystDataError | null>(null)
  const [isPending, setIsPending] = useState(false)
  const suggestions = useMemo(() => starterQuestions(enabledModules), [enabledModules])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!business || !trimmed || trimmed.length > 800) {
      setError(new AnalystDataError("Enter a question between 1 and 800 characters.", "INVALID_REQUEST", 400))
      return
    }
    setError(null)
    setIsPending(true)
    try {
      setResult(await askAnalyst({ businessId: business.id, period, question: trimmed }))
    } catch (cause) {
      setError(cause instanceof AnalystDataError ? new AnalystDataError(analystErrorMessage(cause.code, cause.status), cause.code, cause.status) : new AnalystDataError(analystErrorMessage()))
    } finally {
      setIsPending(false)
    }
  }

  return <section className="space-y-6">
    <PageHeader description="Get grounded answers based on recorded StockPilot business data. AI Analyst is a single-turn summary tool, not an accounting system or recommendation engine." eyebrow="AI Analyst" title="Ask about your business" />

    <form className="rounded-xl border border-primary/20 bg-card p-5 sm:p-6" onSubmit={(event) => { void submit(event).catch(() => undefined) }}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.35fr)_minmax(0,1fr)] sm:items-start">
        <label className="space-y-1.5 text-sm"><span className="font-medium">Period</span><select aria-label="Analysis period" className={inputClass} onChange={(event) => setPeriod(event.target.value as AnalystPeriod)} value={period}>{analystPeriods.map((value) => <option key={value} value={value}>{periodLabels[value]}</option>)}</select></label>
        <label className="space-y-1.5 text-sm"><span className="font-medium">Question</span><textarea aria-describedby="analyst-question-help" aria-invalid={Boolean(error?.code === "INVALID_REQUEST")} className={`${inputClass} min-h-28 resize-y`} maxLength={800} onChange={(event) => setQuestion(event.target.value)} placeholder="What should I know about this period?" value={question} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground" id="analyst-question-help">{question.length}/800 characters · Answers use the selected business and period.</p><Button disabled={isPending || !question.trim()} type="submit">{isPending ? "Analyzing…" : "Ask Analyst"}</Button></div>
      {error && <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error.message}</p>}
    </form>

    <section aria-labelledby="starter-questions-title" className="rounded-xl border border-dashed bg-muted/20 p-5"><h2 className="font-semibold" id="starter-questions-title">Try a grounded question</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{suggestions.map((suggestion) => <button className="rounded-lg border border-border bg-card px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" key={suggestion} onClick={() => setQuestion(suggestion)} type="button">{suggestion}</button>)}</div></section>

    {!result && !isPending && <section className="rounded-xl border bg-card p-8 text-center"><h2 className="text-lg font-semibold">Your answer will appear here</h2><p className="mt-2 text-sm text-muted-foreground">Ask a question to summarize the deterministic facts available to your workspace.</p></section>}
    {isPending && <section className="rounded-xl border bg-card p-8 text-center text-muted-foreground" role="status">Preparing a grounded answer…</section>}
    {result && !isPending && <Answer result={result} />}
  </section>
}

function Answer({ result }: { result: AnalystResponse }) {
  return <section className="space-y-4" aria-label="Analyst answer"><article className="rounded-xl border bg-card p-5 shadow-sm sm:p-6"><h2 className="font-semibold">Answer</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{result.answer}</p></article>{result.evidence.length > 0 && <section aria-labelledby="analyst-evidence-title"><h2 className="mb-3 font-semibold" id="analyst-evidence-title">Evidence</h2><div className="grid gap-3 sm:grid-cols-2">{result.evidence.map((item) => <article className="rounded-xl border bg-card p-4" key={item.id}><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-2 break-all text-xl font-semibold tabular-nums">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.period}</p></article>)}</div></section>}{result.limitations.length > 0 && <section aria-labelledby="analyst-limitations-title" className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-4"><h2 className="font-semibold" id="analyst-limitations-title">Limitations</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{result.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>}</section>
}

function starterQuestions(enabledModules: readonly string[]) {
  const questions = ["Which products currently need stock attention?"]
  if (enabledModules.includes("sales")) questions.push("How did Recorded Sales perform in this period?")
  if (enabledModules.includes("purchasing")) questions.push("Summarize Purchase Receipts for this period.")
  if (enabledModules.includes("expenses")) questions.push("Summarize the available estimated profitability facts.")
  if (questions.length < 4 && enabledModules.includes("smart_insights")) questions.push("Explain the available Smart Inventory observations.")
  return questions.slice(0, 4)
}
