import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { DialogShell } from "@/components/ui/dialog-shell"
import { Button } from "@/components/ui/button"
import { useBusiness } from "@/features/business/business-context"
import { filterCustomers, findPossibleDuplicate, type CustomerStatusFilter } from "@/features/customers/customer-filters"
import { useCustomerMutations, useCustomers } from "@/features/customers/customer-queries"
import type { BasicCustomer, CustomerInput, ManagedCustomer } from "@/features/customers/customer-types"

const inputClass = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
const blankForm = (): CustomerInput => ({ name: "", phone: null, email: null, note: null })
const emptyCustomers: Array<BasicCustomer | ManagedCustomer> = []

export function CustomersPage() {
  const { business, role } = useBusiness()
  const query = useCustomers()
  const mutations = useCustomerMutations()
  const canManage = role === "owner" || role === "manager"
  const scopeKey = `${business?.id ?? ""}:${role ?? ""}`
  const previousScope = useRef(scopeKey)
  const customers = (query.data ?? emptyCustomers) as Array<BasicCustomer | ManagedCustomer>
  const [term, setTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>("active")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedCustomer | null>(null)
  const [selected, setSelected] = useState<ManagedCustomer | null>(null)
  const [lifecycleTarget, setLifecycleTarget] = useState<ManagedCustomer | null>(null)
  const [form, setForm] = useState<CustomerInput>(blankForm)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  useLayoutEffect(() => {
    if (previousScope.current === scopeKey) return
    previousScope.current = scopeKey
    setFormOpen(false); setEditing(null); setSelected(null); setLifecycleTarget(null)
    setForm(blankForm()); setError(""); setStatus(""); setTerm(""); setStatusFilter("active")
  }, [scopeKey])
  const pending = mutations.create.isPending || mutations.update.isPending || mutations.setActive.isPending
  const filtered = useMemo(
    () => filterCustomers(customers, term, canManage ? statusFilter : "active"),
    [canManage, customers, statusFilter, term],
  )
  const possibleDuplicates = useMemo(
    () => findPossibleDuplicate(customers, form.phone ?? "", form.email ?? "", editing?.id),
    [customers, editing?.id, form.email, form.phone],
  )

  const beginCreate = () => {
    setEditing(null); setForm(blankForm()); setFormOpen(true); setError(""); setStatus("")
  }
  const beginEdit = (customer: ManagedCustomer) => {
    setEditing(customer)
    setForm({ name: customer.name, phone: customer.phone, email: customer.email, note: customer.note })
    setFormOpen(true); setError(""); setStatus("")
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setStatus("")
    const name = form.name.trim()
    const phone = form.phone?.trim() || null
    const email = form.email?.trim() || null
    const note = canManage ? form.note?.trim() || null : null
    if (!name) { setError("Customer name is required."); return }
    if (name.length > 160 || (phone?.length ?? 0) > 50 || (email?.length ?? 0) > 320 || (note?.length ?? 0) > 2000) {
      setError("One or more fields exceed the allowed length."); return
    }
    const input: CustomerInput = { name, phone, email, note }
    try {
      if (editing) {
        await mutations.update.mutateAsync({ id: editing.id, input })
        setStatus("Customer updated.")
      } else {
        await mutations.create.mutateAsync(input)
        setStatus("Customer created.")
      }
      setFormOpen(false); setEditing(null); setForm(blankForm())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save this customer.")
    }
  }

  const confirmLifecycle = async () => {
    if (!lifecycleTarget) return
    setError(""); setStatus("")
    try {
      await mutations.setActive.mutateAsync({ id: lifecycleTarget.id, active: !lifecycleTarget.isActive })
      setStatus(lifecycleTarget.isActive
        ? "Customer deactivated. Historical sales remain unchanged; this customer can't be selected for new sales."
        : "Customer reactivated.")
      setLifecycleTarget(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't update this customer's status.")
    }
  }

  return <section className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">Workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Customers</h1><p className="mt-2 max-w-2xl text-muted-foreground">Keep customer contact details together. Duplicate contact details are allowed; a warning never prevents creating a separate record.</p></div>
      <Button onClick={beginCreate}>Add customer</Button>
    </header>

    {status && <p aria-live="polite" className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm" role="status">{status}</p>}
    {error && !formOpen && !lifecycleTarget && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}

    <div className={`grid gap-3 rounded-xl border border-border bg-card p-4 ${canManage ? "sm:grid-cols-[minmax(0,1fr)_180px]" : "sm:grid-cols-1"} sm:items-end`}>
      <label className="space-y-1.5 text-sm"><span>Search customers</span><input className={inputClass} onChange={(event) => setTerm(event.target.value)} placeholder="Name, phone or email" type="search" value={term} /></label>
      {canManage && <label className="space-y-1.5 text-sm"><span>Status</span><select className={inputClass} onChange={(event) => setStatusFilter(event.target.value as CustomerStatusFilter)} value={statusFilter}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All customers</option></select></label>}
    </div>

    {query.isLoading && <p className="rounded-xl border p-8 text-center text-muted-foreground" role="status">Loading customers…</p>}
    {query.isError && <div className="rounded-xl border border-destructive/25 p-8 text-center" role="alert"><p className="text-sm text-destructive">Customers are unavailable. Check that the Customers module is enabled and try again.</p><Button className="mt-3" onClick={() => void query.refetch()} variant="outline">Try again</Button></div>}
    {!query.isLoading && !query.isError && filtered.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-semibold">{customers.length ? "No matching customers" : "No customers yet"}</h2><p className="mt-1 text-sm text-muted-foreground">{customers.length ? "Adjust your search or status filter." : "Customers you add will appear here."}</p></div>}

    {!query.isLoading && !query.isError && filtered.length > 0 && <>
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block"><table className="w-full text-left"><caption className="sr-only">Customer directory</caption><thead className="border-b bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Name", "Phone", "Email", ...(canManage ? ["Status", "Actions"] : [])].map((label) => <th className="px-4 py-3 font-medium" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y">{filtered.map((customer) => <tr key={customer.id}><td className="max-w-64 break-words px-4 py-3 font-medium">{customer.name}</td><td className="px-4 py-3">{customer.phone ?? <span className="text-muted-foreground">—</span>}</td><td className="max-w-64 break-all px-4 py-3">{customer.email ?? <span className="text-muted-foreground">—</span>}</td>{canManage && <><td className="px-4 py-3"><StatusBadge active={customer.isActive} /></td><td className="px-4 py-3"><CustomerActions customer={customer as ManagedCustomer} onDetails={() => setSelected(customer as ManagedCustomer)} onEdit={() => beginEdit(customer as ManagedCustomer)} onLifecycle={() => { setLifecycleTarget(customer as ManagedCustomer); setError("") }} /></td></>}</tr>)}</tbody></table></div>
      <ul aria-label="Customer directory" className="grid gap-3 md:hidden">{filtered.map((customer) => <li className="min-w-0 rounded-xl border border-border bg-card p-4" key={customer.id}><div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{customer.name}</h2>{canManage && <StatusBadge active={customer.isActive} />}</div><p className="mt-3 break-all text-sm">{customer.phone ?? <span className="text-muted-foreground">No phone</span>}</p><p className="break-all text-sm text-muted-foreground">{customer.email ?? "No email"}</p>{canManage && <div className="mt-3"><CustomerActions customer={customer as ManagedCustomer} onDetails={() => setSelected(customer as ManagedCustomer)} onEdit={() => beginEdit(customer as ManagedCustomer)} onLifecycle={() => { setLifecycleTarget(customer as ManagedCustomer); setError("") }} /></div>}</li>)}</ul>
    </>}

    {formOpen && <DialogShell description={editing ? "Update this customer's contact details." : canManage ? "Add a customer to this business directory." : "Add a customer using basic contact details."} onClose={() => { if (!pending) { setFormOpen(false); setError("") } }} title={editing ? "Edit customer" : "New customer"}>
      <form aria-labelledby="customer-form-title" className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={(event) => void submit(event)}>
        <h2 className="sr-only sm:col-span-2" id="customer-form-title">{editing ? "Edit customer" : "New customer"}</h2>
        <label className="space-y-1.5 text-sm sm:col-span-2"><span>Name *</span><input aria-describedby={error ? "customer-form-error" : undefined} aria-invalid={Boolean(error)} autoComplete="name" autoFocus className={inputClass} maxLength={160} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} required value={form.name} /></label>
        <label className="space-y-1.5 text-sm"><span>Phone <span className="text-muted-foreground">(optional)</span></span><input autoComplete="tel" className={inputClass} maxLength={50} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} value={form.phone ?? ""} /></label>
        <label className="space-y-1.5 text-sm"><span>Email <span className="text-muted-foreground">(optional)</span></span><input autoComplete="email" className={inputClass} maxLength={320} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} type="email" value={form.email ?? ""} /></label>
        {canManage && <label className="space-y-1.5 text-sm sm:col-span-2"><span>Private note <span className="text-muted-foreground">(optional)</span></span><textarea className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/20" maxLength={2000} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} value={form.note ?? ""} /></label>}
        {possibleDuplicates.length > 0 && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm sm:col-span-2" role="status"><span className="font-medium">Possible existing customer match:</span> {possibleDuplicates.map((customer) => customer.name).join(", ")}. You can still create a separate record; nothing will be merged.</p>}
        {error && <p className="text-sm text-destructive sm:col-span-2" id="customer-form-error" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2"><Button disabled={pending} type="submit">{pending ? "Saving…" : editing ? "Save changes" : "Create customer"}</Button><Button disabled={pending} onClick={() => { setFormOpen(false); setError("") }} type="button" variant="outline">Cancel</Button></div>
      </form>
    </DialogShell>}

    {selected && canManage && <DialogShell description="Customer directory details. Sales history will be available separately in a later phase." onClose={() => setSelected(null)} title="Customer details">
      <dl className="grid gap-4 sm:grid-cols-2"><Detail label="Name">{selected.name}</Detail><Detail label="Status">{selected.isActive ? "Active" : "Inactive"}</Detail><Detail label="Phone">{selected.phone ?? "Not provided"}</Detail><Detail label="Email">{selected.email ?? "Not provided"}</Detail><Detail label="Private note">{selected.note ?? "No note"}</Detail><Detail label="Created">{formatDate(selected.createdAt)}</Detail><Detail label="Last updated">{formatDate(selected.updatedAt)}</Detail></dl>
    </DialogShell>}

    {lifecycleTarget && <DialogShell description={lifecycleTarget.isActive ? "Historical sales remain unchanged. This customer will not be selectable for new sales while inactive." : "This customer will become available for new sales again."} onClose={() => { if (!pending) setLifecycleTarget(null) }} title={lifecycleTarget.isActive ? "Deactivate customer?" : "Reactivate customer?"}>
      {error && <p className="mb-4 text-sm text-destructive" role="alert">{error}</p>}<div className="flex flex-wrap gap-2"><Button disabled={pending} onClick={() => void confirmLifecycle()} type="button">{pending ? "Saving…" : lifecycleTarget.isActive ? "Confirm deactivation" : "Confirm reactivation"}</Button><Button disabled={pending} onClick={() => setLifecycleTarget(null)} type="button" variant="outline">Cancel</Button></div>
    </DialogShell>}
  </section>
}

function CustomerActions({ customer, onDetails, onEdit, onLifecycle }: { customer: ManagedCustomer; onDetails: () => void; onEdit: () => void; onLifecycle: () => void }) {
  return <div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link aria-label={`View profile for ${customer.name}`} to={`/customers/${customer.id}`}>Profile</Link></Button><Button aria-label={`View details for ${customer.name}`} onClick={onDetails} size="sm" variant="outline">Details</Button><Button aria-label={`Edit ${customer.name}`} onClick={onEdit} size="sm" variant="outline">Edit</Button><Button aria-label={`${customer.isActive ? "Deactivate" : "Reactivate"} ${customer.name}`} onClick={onLifecycle} size="sm" variant="outline">{customer.isActive ? "Deactivate" : "Reactivate"}</Button></div>
}

function StatusBadge({ active }: { active: boolean }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{active ? "Active" : "Inactive"}</span> }
function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{children}</dd></div> }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) }
