import { useMemo, useState, type FormEvent } from "react"

import { PageHeader } from "@/components/layout/page-header"
import { PurchasingSectionNav } from "@/components/purchasing/purchasing-section-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state"
import { useBusiness } from "@/features/business/business-context"
import { useManagedSuppliers, useSupplierMutations } from "@/features/purchasing/purchasing-queries"
import type { ManagedSupplier, SupplierInput } from "@/features/purchasing/purchasing-types"

const blank: SupplierInput = { name: "", contact_name: null, phone: null, email: null, notes: null }
const inputClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"

export function PurchasingSuppliersPage() {
  const { role } = useBusiness()
  const query = useManagedSuppliers()
  const mutations = useSupplierMutations()
  const canManage = role === "owner" || role === "manager"
  const [term, setTerm] = useState("")
  const [filter, setFilter] = useState("active")
  const [editing, setEditing] = useState<ManagedSupplier | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<SupplierInput>(blank)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const pending = mutations.create.isPending || mutations.update.isPending || mutations.setActive.isPending
  const filtered = useMemo(() => (query.data ?? []).filter((supplier) => (filter === "all" || (filter === "active" ? supplier.isActive : !supplier.isActive)) && [supplier.name, supplier.contactName, supplier.phone, supplier.email].some((value) => value?.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()))), [filter, query.data, term])

  const beginEdit = (supplier?: ManagedSupplier) => {
    setEditing(supplier ?? null)
    setFormOpen(true)
    setForm(supplier ? { name: supplier.name, contact_name: supplier.contactName, phone: supplier.phone, email: supplier.email, notes: supplier.notes } : blank)
    setError("")
    setStatus("")
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) { setError("Supplier name is required."); return }
    if (form.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("Enter a valid email address."); return }
    if (name.length > 160 || (form.contact_name?.trim().length ?? 0) > 120 || (form.phone?.trim().length ?? 0) > 50 || (form.email?.trim().length ?? 0) > 320 || (form.notes?.trim().length ?? 0) > 2000) { setError("One or more fields exceed the allowed length."); return }
    const input = { name, contact_name: form.contact_name?.trim() || null, phone: form.phone?.trim() || null, email: form.email?.trim() || null, notes: form.notes?.trim() || null }
    setError("")
    try {
      if (editing) await mutations.update.mutateAsync({ id: editing.id, input })
      else await mutations.create.mutateAsync(input)
      setStatus(editing ? "Supplier updated." : "Supplier created.")
      setEditing(null)
      setFormOpen(false)
      setForm(blank)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save this supplier.")
    }
  }

  const toggle = async (supplier: ManagedSupplier) => {
    setError("")
    setStatus("")
    try {
      await mutations.setActive.mutateAsync({ id: supplier.id, active: !supplier.isActive })
      setStatus(supplier.isActive ? "Supplier deactivated. Historical purchases remain intact." : "Supplier reactivated.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't update this supplier.")
    }
  }

  return (
    <section className="space-y-6">
      <PurchasingSectionNav />
      <PageHeader actions={canManage ? <Button onClick={() => beginEdit()}>Add supplier</Button> : undefined} description="Manage suppliers used for stock receipts. Past purchase records keep their original supplier snapshot." eyebrow="Purchasing" title="Suppliers" />

      {canManage && formOpen && (
        <form className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2" noValidate onSubmit={(event) => void submit(event)}>
          <h2 className="font-semibold sm:col-span-2">{editing ? "Edit supplier" : "New supplier"}</h2>
          {([["name", "Supplier name"], ["contact_name", "Contact name"], ["phone", "Phone"], ["email", "Email"]] as const).map(([key, label]) => (
            <label className="space-y-1.5 text-sm" key={key}>
              <span>{label}{key === "name" ? " *" : ""}</span>
              <input className={inputClass} maxLength={key === "name" ? 160 : key === "contact_name" ? 120 : key === "phone" ? 50 : 320} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} required={key === "name"} type={key === "email" ? "email" : "text"} value={form[key] ?? ""} />
            </label>
          ))}
          <label className="space-y-1.5 text-sm sm:col-span-2"><span>Notes</span><textarea className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} value={form.notes ?? ""} /></label>
          {error && <p className="text-sm text-destructive sm:col-span-2" role="alert">{error}</p>}
          <div className="flex gap-2 sm:col-span-2"><Button disabled={pending} type="submit">{pending ? "Saving…" : "Save supplier"}</Button><Button onClick={() => { setEditing(null); setFormOpen(false); setForm(blank); setError("") }} type="button" variant="outline">Cancel</Button></div>
        </form>
      )}

      {status && <p className="text-sm" role="status">{status}</p>}
      {error && !formOpen && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
        <label className="space-y-1.5 text-sm"><span>Search suppliers</span><input className={inputClass} onChange={(event) => setTerm(event.target.value)} placeholder="Name, contact, phone or email" type="search" value={term} /></label>
        <label className="space-y-1.5 text-sm"><span>Status</span><select className={inputClass} onChange={(event) => setFilter(event.target.value)} value={filter}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All suppliers</option></select></label>
      </div>

      {query.isLoading && <LoadingState className="rounded-lg border border-border bg-card p-8 text-center" label="Loading suppliers…" />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} title="Suppliers unavailable">Please try again.</ErrorState>}
      {!query.isLoading && !query.isError && !filtered.length && <EmptyState description={query.data?.length ? "Change your search or status filter." : "Suppliers you add will be available when receiving stock."} title={query.data?.length ? "No matching suppliers" : "No suppliers yet"} />}

      <ul className="grid gap-3 md:grid-cols-2">{filtered.map((supplier) => (
        <li className="min-w-0 rounded-lg border border-border bg-card p-4" key={supplier.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="break-words font-semibold">{supplier.name}</h2><span className="mt-1 inline-block"><Badge variant={supplier.isActive ? "success" : "neutral"}>{supplier.isActive ? "Active" : "Inactive"}</Badge></span></div>
            {canManage && <div className="flex shrink-0 gap-2"><Button onClick={() => beginEdit(supplier)} size="sm" variant="outline">Edit</Button><Button onClick={() => void toggle(supplier)} size="sm" variant="outline">{supplier.isActive ? "Deactivate" : "Reactivate"}</Button></div>}
          </div>
          {supplier.contactName && <p className="mt-3 text-sm">{supplier.contactName}</p>}
          {supplier.phone && <p className="break-all text-sm text-muted-foreground">{supplier.phone}</p>}
          {supplier.email && <p className="break-all text-sm text-muted-foreground">{supplier.email}</p>}
          {supplier.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{supplier.notes}</p>}
        </li>
      ))}</ul>
    </section>
  )
}
