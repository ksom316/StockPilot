import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { BusinessIcon, businessIconOptions, type BusinessIconId } from "@/features/business/business-icons"
import { useBusiness } from "@/features/business/business-context"
import { optionalModules, type OptionalModule } from "@/features/business/modules"
import { currencyOptions, defaultBusinessCurrency, type BusinessCurrency } from "@/features/business/currency"

const businessTypes = ["Retail", "Electronics", "Fashion", "Cosmetics", "Grocery / Mini-mart", "Pharmacy", "Other"]

export function CreateBusinessPage() {
  const navigate = useNavigate()
  const { createBusiness } = useBusiness()
  const [name, setName] = useState("")
  const [type, setType] = useState("")
  const [customType, setCustomType] = useState("")
  const [iconId, setIconId] = useState<BusinessIconId>("store")
  const [currency, setCurrency] = useState<BusinessCurrency>(defaultBusinessCurrency)
  const [modules, setModules] = useState<OptionalModule[]>([])
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const businessType = type === "Other" ? customType.trim() : type
  const toggle = (module: OptionalModule) => setModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module])
  const submit = async () => {
    if (!name.trim() || name.trim().length > 160 || !businessType || businessType.length > 80) { setError("Enter a valid business name and type."); return }
    setPending(true); setError("")
    try { await createBusiness({ name: name.trim(), businessType, enabledModules: modules, iconId, currency }); navigate("/dashboard", { replace: true }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't create that business. Try again.") }
    finally { setPending(false) }
  }
  return <section className="mx-auto max-w-3xl space-y-6">
    <div><p className="text-sm font-medium text-primary">Workspace management</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Create another business</h1><p className="mt-2 text-muted-foreground">Add an intentional new workspace to this account. Your current workspace remains unchanged.</p></div>
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="space-y-5"><FormField autoComplete="organization" autoFocus id="new-business-name" label="Business name" onChange={(event) => setName(event.target.value)} placeholder="Northstar Market" value={name} />
        <div className="space-y-2"><label className="block text-sm font-medium" htmlFor="new-business-type">Business type</label><select className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm" id="new-business-type" onChange={(event) => setType(event.target.value)} value={type}><option value="">Select a type</option>{businessTypes.map((item) => <option key={item}>{item}</option>)}</select>{type === "Other" && <FormField id="new-custom-business-type" label="Custom business type" maxLength={80} onChange={(event) => setCustomType(event.target.value)} value={customType} />}</div>
        <fieldset><legend className="text-sm font-medium">Business icon</legend><div aria-label="Business icon choices" className="mt-2 flex flex-wrap gap-2" role="group">{businessIconOptions.map((option) => <button aria-label={option.label} aria-pressed={iconId === option.id} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm ${iconId === option.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted"}`} key={option.id} onClick={() => setIconId(option.id)} type="button"><BusinessIcon className="size-4" id={option.id} />{option.label}</button>)}</div></fieldset>
        <div className="space-y-2"><label className="block text-sm font-medium" htmlFor="new-business-currency">Business currency</label><select className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm" id="new-business-currency" onChange={(event) => setCurrency(event.target.value as BusinessCurrency)} value={currency}>{currencyOptions.map((option) => <option key={option.code} value={option.code}>{option.code} — {option.name} ({option.symbol})</option>)}</select><p className="text-xs text-muted-foreground">Changing this later changes labels and formatting only; existing amounts are not converted.</p></div>
        <fieldset><legend className="text-sm font-medium">Optional tools</legend><p className="mt-1 text-sm text-muted-foreground">Inventory is always enabled for every business.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{optionalModules.map((module) => <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm" key={module.key}><input checked={modules.includes(module.key)} onChange={() => toggle(module.key)} type="checkbox" />{module.label}</label>)}</div></fieldset>
      </div>
      {error && <p className="mt-5 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
      <div className="mt-7 flex justify-end gap-2"><Button onClick={() => navigate(-1)} type="button" variant="outline">Cancel</Button><Button disabled={pending} onClick={() => void submit()}>{pending ? "Creating business…" : "Create business"}</Button></div>
    </div>
  </section>
}
