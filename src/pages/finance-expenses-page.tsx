import { useMemo, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { useBusiness } from "@/features/business/business-context"
import { filterExpenses, type ExpenseStatus } from "@/features/finance/finance-filters"
import { formatExpenseMoney, isValidIsoDate, parseExpenseAmount } from "@/features/finance/finance-money"
import { useExpenseAudit, useExpenseCategories, useExpenseMutations, useExpenses } from "@/features/finance/finance-queries"
import type { Expense, ExpenseInput } from "@/features/finance/finance-types"

const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
const blankForm = (): ExpenseInput => ({ categoryId: "", amount: "", expenseDate: localDate(), description: "", notes: null })
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` }

export function FinanceExpensesPage() {
  const { business } = useBusiness()
  const expensesQuery = useExpenses()
  const categoriesQuery = useExpenseCategories()
  const mutations = useExpenseMutations()
  const [term, setTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus>("active")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [editing, setEditing] = useState<Expense | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ExpenseInput>(blankForm)
  const [selected, setSelected] = useState<Expense | null>(null)
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null)
  const [voidReason, setVoidReason] = useState("")
  const [categoryName, setCategoryName] = useState("")
  const [categoryEditing, setCategoryEditing] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const auditQuery = useExpenseAudit(selected?.id ?? null)
  const pending = mutations.create.isPending || mutations.update.isPending || mutations.void.isPending || mutations.createCategory.isPending || mutations.updateCategory.isPending
  const activeCategories = (categoriesQuery.data ?? []).filter((category) => category.isActive)
  const filtered = useMemo(() => filterExpenses(expensesQuery.data ?? [], { term, categoryId: categoryFilter, status: statusFilter, startDate, endDate }), [expensesQuery.data, term, categoryFilter, statusFilter, startDate, endDate])

  const beginForm = (expense?: Expense) => {
    setEditing(expense ?? null)
    setForm(expense ? { categoryId: expense.categoryId, amount: expense.amount, expenseDate: expense.expenseDate, description: expense.description, notes: expense.notes } : { ...blankForm(), categoryId: activeCategories[0]?.id ?? "" })
    setFormOpen(true); setError(""); setStatus("")
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setStatus("")
    const amount = parseExpenseAmount(form.amount)
    if (!amount) { setError("Enter an amount greater than zero with no more than four decimal places."); return }
    if (!activeCategories.some((category) => category.id === form.categoryId)) { setError("Choose an active expense category."); return }
    if (!isValidIsoDate(form.expenseDate)) { setError("Enter a valid expense date."); return }
    const description = form.description.trim()
    const notes = form.notes?.trim() || null
    if (!description || description.length > 500) { setError("Description is required and must be 500 characters or fewer."); return }
    if (notes && notes.length > 2000) { setError("Notes must be 2,000 characters or fewer."); return }
    const input = { ...form, amount: amount.value, description, notes }
    try {
      if (editing) {
        const saved = await mutations.update.mutateAsync({ id: editing.id, input })
        if (selected?.id === editing.id) setSelected(saved)
      }
      else await mutations.create.mutateAsync(input)
      setStatus(editing ? "Expense updated. The change was added to its history." : "Expense created.")
      setFormOpen(false); setEditing(null); setForm(blankForm())
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't save this expense.") }
  }
  const submitVoid = async (event: FormEvent) => {
    event.preventDefault(); setError("")
    if (!voidTarget || !voidReason.trim()) { setError("Enter a reason to void this expense."); return }
    try {
      const saved = await mutations.void.mutateAsync({ id: voidTarget.id, reason: voidReason.trim() })
      if (selected?.id === voidTarget.id) setSelected(saved)
      setStatus("Expense voided. It remains in history and is excluded from future summaries."); setVoidTarget(null); setVoidReason("")
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't void this expense.") }
  }
  const saveCategory = async (event: FormEvent) => {
    event.preventDefault(); setError("")
    const name = categoryEditing ? categoryEditing.name.trim() : categoryName.trim()
    if (!name || name.length > 120) { setError("Category name is required and must be 120 characters or fewer."); return }
    try {
      if (categoryEditing) { await mutations.updateCategory.mutateAsync({ id: categoryEditing.id, name }); setCategoryEditing(null); setStatus("Category updated. Existing expenses keep their saved category name.") }
      else { await mutations.createCategory.mutateAsync(name); setCategoryName(""); setStatus("Category created.") }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't save this category.") }
  }

  return <section className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">Finance</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Expenses</h1><p className="mt-2 max-w-2xl text-muted-foreground">Track operating costs such as rent, utilities, transport, marketing, or internet. Stock bought for resale belongs in Purchasing.</p></div><Button onClick={() => beginForm()} disabled={!activeCategories.length}>Add expense</Button></header>
    {status && <p aria-live="polite" className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm" role="status">{status}</p>}
    {error && !formOpen && !voidTarget && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}

    {formOpen && <form aria-labelledby="expense-form-title" className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2" noValidate onSubmit={(event) => void submit(event)}>
      <h2 className="font-semibold sm:col-span-2" id="expense-form-title">{editing ? "Edit expense" : "New expense"}</h2>
      <label className="space-y-1.5 text-sm"><span>Amount *</span><input aria-describedby={error ? "expense-form-error" : undefined} autoComplete="off" className={inputClass} inputMode="decimal" onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} placeholder="0.00" value={form.amount} /></label>
      <label className="space-y-1.5 text-sm"><span>Category *</span><select className={inputClass} onChange={(event) => setForm((value) => ({ ...value, categoryId: event.target.value }))} value={form.categoryId}><option value="">Select a category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="space-y-1.5 text-sm"><span>Expense date *</span><input className={inputClass} onChange={(event) => setForm((value) => ({ ...value, expenseDate: event.target.value }))} type="date" value={form.expenseDate} /></label>
      <label className="space-y-1.5 text-sm sm:col-span-2"><span>Description *</span><input className={inputClass} maxLength={500} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} value={form.description} /></label>
      <label className="space-y-1.5 text-sm sm:col-span-2"><span>Note <span className="text-muted-foreground">(optional)</span></span><textarea className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/20" maxLength={2000} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} value={form.notes ?? ""} /></label>
      {error && <p className="text-sm text-destructive sm:col-span-2" id="expense-form-error" role="alert">{error}</p>}{editing && <p className="text-xs text-muted-foreground sm:col-span-2">Edits are recorded in the expense history.</p>}
      <div className="flex gap-2 sm:col-span-2"><Button disabled={pending} type="submit">{pending ? "Saving…" : editing ? "Save changes" : "Create expense"}</Button><Button disabled={pending} onClick={() => { setFormOpen(false); setError("") }} type="button" variant="outline">Cancel</Button></div>
    </form>}

    {voidTarget && <form aria-labelledby="void-title" className="space-y-3 rounded-xl border border-destructive/30 bg-card p-4" noValidate onSubmit={(event) => void submitVoid(event)}><h2 className="font-semibold" id="void-title">Void expense</h2><p className="text-sm text-muted-foreground">This keeps the expense in history and excludes it from future summaries. Voiding cannot be undone.</p><label className="block space-y-1.5 text-sm"><span>Reason *</span><textarea autoFocus className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/20" maxLength={1000} onChange={(event) => setVoidReason(event.target.value)} value={voidReason} /></label>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex gap-2"><Button disabled={pending} type="submit" variant="outline">{pending ? "Voiding…" : "Confirm void"}</Button><Button disabled={pending} onClick={() => { setVoidTarget(null); setVoidReason(""); setError("") }} type="button" variant="outline">Cancel</Button></div></form>}

    <section aria-label="Expense filters" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <label className="space-y-1.5 text-sm"><span>Search description</span><input className={inputClass} onChange={(event) => setTerm(event.target.value)} type="search" value={term} /></label>
      <label className="space-y-1.5 text-sm"><span>Category</span><select className={inputClass} onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}><option value="">All categories</option>{(categoriesQuery.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="space-y-1.5 text-sm"><span>Status</span><select className={inputClass} onChange={(event) => setStatusFilter(event.target.value as ExpenseStatus)} value={statusFilter}><option value="active">Active</option><option value="voided">Voided</option><option value="all">All</option></select></label>
      <label className="space-y-1.5 text-sm"><span>From</span><input className={inputClass} onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label>
      <label className="space-y-1.5 text-sm"><span>To</span><input className={inputClass} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label>
      <Button className="sm:col-span-2 lg:col-span-5 lg:justify-self-end" onClick={() => { setTerm(""); setCategoryFilter(""); setStatusFilter("active"); setStartDate(""); setEndDate("") }} type="button" variant="outline">Clear filters</Button>
    </section>

    {categoriesQuery.isError && <p className="rounded-lg border border-destructive/25 p-4 text-sm text-destructive" role="alert">Expense categories are unavailable. Check that Finance is enabled and try again.</p>}
    {expensesQuery.isLoading && <p className="rounded-xl border p-8 text-center text-muted-foreground" role="status">Loading expenses…</p>}
    {expensesQuery.isError && <div className="rounded-xl border border-destructive/25 p-8 text-center" role="alert"><p className="text-sm text-destructive">Expenses are unavailable. Check that Finance is enabled and try again.</p><Button className="mt-3" onClick={() => void expensesQuery.refetch()} variant="outline">Try again</Button></div>}
    {!expensesQuery.isLoading && !expensesQuery.isError && filtered.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-semibold">{expensesQuery.data?.length ? "No matching expenses" : "No expenses yet"}</h2><p className="mt-1 text-sm text-muted-foreground">{expensesQuery.data?.length ? "Adjust or clear your filters." : "Operating expenses you record will appear here. Stock purchases remain in Purchasing."}</p></div>}
    {filtered.length > 0 && business && <>
      <p className="text-sm text-muted-foreground">Showing {filtered.length} of {expensesQuery.data?.length ?? 0} expenses. The current list is filtered in the browser; revisit server pagination as the history grows.</p>
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block"><table className="w-full text-left"><caption className="sr-only">Business expenses</caption><thead className="border-b bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Date", "Description", "Category", "Status", "Amount", "Actions"].map((label) => <th className="px-4 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y">{filtered.map((expense) => <tr key={expense.id} className={expense.voided ? "text-muted-foreground" : ""}><td className="whitespace-nowrap px-4 py-3">{expense.expenseDate}</td><td className="max-w-xs px-4 py-3"><p className="break-words font-medium">{expense.description}</p></td><td className="px-4 py-3">{expense.categoryName}</td><td className="px-4 py-3"><StatusBadge voided={expense.voided} /></td><td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatExpenseMoney(expense.amount, business.currency)}</td><td className="px-4 py-3"><ExpenseActions expense={expense} onDetails={() => setSelected(expense)} onEdit={() => beginForm(expense)} onVoid={() => { setVoidTarget(expense); setError(""); setStatus("") }} /></td></tr>)}</tbody></table></div>
      <ul aria-label="Business expenses" className="space-y-3 md:hidden">{filtered.map((expense) => <li className={`rounded-xl border bg-card p-4 ${expense.voided ? "opacity-75" : ""}`} key={expense.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{expense.description}</h2><p className="mt-1 text-sm text-muted-foreground">{expense.expenseDate} · {expense.categoryName}</p></div><strong className="shrink-0 text-right tabular-nums">{formatExpenseMoney(expense.amount, business.currency)}</strong></div><div className="mt-3 flex items-center justify-between gap-2"><StatusBadge voided={expense.voided} /><ExpenseActions expense={expense} onDetails={() => setSelected(expense)} onEdit={() => beginForm(expense)} onVoid={() => { setVoidTarget(expense); setError(""); setStatus("") }} /></div></li>)}</ul>
    </>}

    <section aria-labelledby="categories-title" className="space-y-4 rounded-xl border bg-card p-4"><div><h2 className="font-semibold" id="categories-title">Expense categories</h2><p className="mt-1 text-sm text-muted-foreground">Default categories are fixed. Custom categories can be renamed or deactivated; history is preserved.</p></div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void saveCategory(event)}><label className="sr-only" htmlFor="new-expense-category">New category name</label><input className={inputClass} id="new-expense-category" maxLength={120} onChange={(event) => categoryEditing ? setCategoryEditing({ ...categoryEditing, name: event.target.value }) : setCategoryName(event.target.value)} placeholder={categoryEditing ? "Category name" : "Add a custom category"} value={categoryEditing?.name ?? categoryName} /><Button disabled={pending} type="submit">{categoryEditing ? "Save category" : "Add category"}</Button>{categoryEditing && <Button onClick={() => setCategoryEditing(null)} type="button" variant="outline">Cancel</Button>}</form>
      <ul className="divide-y">{(categoriesQuery.data ?? []).map((category) => <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={category.id}><div className="min-w-0"><p className="break-words font-medium">{category.name}</p><p className="text-xs text-muted-foreground">{category.isSystem ? "Default category" : "Custom category"} · {category.isActive ? "Active" : "Inactive"}</p></div>{!category.isSystem && <div className="flex gap-2"><Button disabled={pending} onClick={() => setCategoryEditing({ id: category.id, name: category.name })} size="sm" variant="outline">Rename</Button><Button disabled={pending} onClick={() => void mutations.updateCategory.mutateAsync({ id: category.id, isActive: !category.isActive }).then(() => setStatus(category.isActive ? "Category deactivated. Existing expenses keep their history." : "Category reactivated.")).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "We couldn't update this category."))} size="sm" variant="outline">{category.isActive ? "Deactivate" : "Reactivate"}</Button></div>}</li>)}</ul>
    </section>

    {selected && <section aria-labelledby="expense-details-title" className="space-y-4 rounded-xl border border-primary/25 bg-card p-4" tabIndex={-1}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold" id="expense-details-title">Expense details</h2><p className="mt-1 text-sm text-muted-foreground">{selected.description}</p></div><Button onClick={() => setSelected(null)} type="button" variant="outline">Close details</Button></div><dl className="grid gap-3 sm:grid-cols-2"><Detail label="Amount">{business && formatExpenseMoney(selected.amount, business.currency)}</Detail><Detail label="Date">{selected.expenseDate}</Detail><Detail label="Category">{selected.categoryName}</Detail><Detail label="Status">{selected.voided ? `Voided · ${selected.voidReason ?? ""}` : "Active"}</Detail><Detail label="Note">{selected.notes ?? "No note"}</Detail><Detail label="Created">{formatDateTime(selected.createdAt)} · Team member</Detail>{selected.voidedAt && <Detail label="Voided">{formatDateTime(selected.voidedAt)} · Team member</Detail>}</dl>
      <div><h3 className="font-medium">Change history</h3>{auditQuery.isLoading && <p className="mt-2 text-sm text-muted-foreground" role="status">Loading history…</p>}{auditQuery.isError && <p className="mt-2 text-sm text-destructive" role="alert">History is unavailable.</p>}{auditQuery.data && <ol className="mt-2 space-y-2">{auditQuery.data.map((event, index) => <li className="rounded-lg bg-muted/50 p-3 text-sm" key={`${event.changedAt}-${index}`}><p className="font-medium">{event.action === "created" ? "Created" : event.action === "updated" ? "Updated" : "Voided"} · {formatDateTime(event.changedAt)}</p><p className="mt-1 text-muted-foreground">{event.actorLabel}{event.action === "updated" ? describeAuditChange(event) : event.action === "voided" ? ` · ${String(event.afterData?.void_reason ?? "Reason recorded")}` : ""}</p></li>)}</ol>}</div>
    </section>}
  </section>
}

function StatusBadge({ voided }: { voided: boolean }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${voided ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{voided ? "Voided" : "Active"}</span> }
function ExpenseActions({ expense, onDetails, onEdit, onVoid }: { expense: Expense; onDetails: () => void; onEdit: () => void; onVoid: () => void }) { return <div className="flex flex-wrap justify-end gap-2"><Button aria-label={`View details for ${expense.description}`} onClick={onDetails} size="sm" variant="outline">Details</Button>{!expense.voided && <><Button aria-label={`Edit ${expense.description}`} onClick={onEdit} size="sm" variant="outline">Edit</Button><Button aria-label={`Void ${expense.description}`} onClick={onVoid} size="sm" variant="outline">Void</Button></>}</div> }
function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{children}</dd></div> }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) }
function describeAuditChange(event: { beforeData: Record<string, unknown> | null; afterData: Record<string, unknown> | null }) {
  const before = event.beforeData ?? {}; const after = event.afterData ?? {}; const changed: string[] = []
  if (before.amount !== after.amount) changed.push("amount")
  if (before.category_name !== after.category_name) changed.push("category")
  if (before.expense_date !== after.expense_date) changed.push("date")
  if (before.description !== after.description) changed.push("description")
  if (before.notes !== after.notes) changed.push("note")
  return changed.length ? ` · Changed ${changed.join(", ")}` : " · Details updated"
}
