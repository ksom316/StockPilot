import { Check, PackageCheck } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { useBusiness } from "@/features/business/business-context"
import { optionalModules } from "@/features/business/modules"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BusinessIcon, businessIconOptions, type BusinessIconId } from "@/features/business/business-icons"
import { BusinessLogo } from "@/components/branding/business-logo"
import { currencyOptions, type BusinessCurrency } from "@/features/business/currency"

export function ModuleSettingsPage() {
  const { business, businesses, enabledModules, hasFinancialActivity, isLoading, error, role, setBusinessLogo, removeBusinessLogo, setModuleEnabled, setBusinessIcon, setBusinessCurrency, switchBusiness } = useBusiness()
  const [pendingModule, setPendingModule] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState("")
  const [isCurrencySaving, setIsCurrencySaving] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const canManage = role === "owner"

  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview) }, [logoPreview])

  const toggleModule = async (module: (typeof optionalModules)[number]["key"], enabled: boolean) => {
    if (!canManage || pendingModule) return
    setPendingModule(module)
    setUpdateError("")
    try {
      await setModuleEnabled(module, enabled)
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : "We couldn't update this module. Please try again.")
    } finally {
      setPendingModule(null)
    }
  }

  const chooseBusinessIcon = async (iconId: BusinessIconId) => {
    if (!canManage || pendingModule || iconId === business?.iconId) return
    setPendingModule("business-icon")
    setUpdateError("")
    try {
      await setBusinessIcon(iconId)
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : "We couldn't update the business icon. Please try again.")
    } finally {
      setPendingModule(null)
    }
  }

  const chooseCurrency = async (currency: BusinessCurrency) => {
    if (!canManage || currency === business?.currency || isCurrencySaving) return
    setIsCurrencySaving(true); setUpdateError("")
    try { await setBusinessCurrency(currency) } catch (cause) { setUpdateError(cause instanceof Error ? cause.message : "We couldn't update the business currency. Please try again.") } finally { setIsCurrencySaving(false) }
  }

  const chooseBusinessLogo = async (file: File) => {
    const nextPreview = URL.createObjectURL(file)
    setLogoPreview(nextPreview); setUpdateError("")
    try { await setBusinessLogo(file) } catch (cause) { setUpdateError(cause instanceof Error ? cause.message : "We couldn't update the business logo. Please try again.") } finally { URL.revokeObjectURL(nextPreview); setLogoPreview(null); if (logoInputRef.current) logoInputRef.current.value = "" }
  }

  if (isLoading) return <p className="flex min-h-56 items-center justify-center text-sm text-muted-foreground" role="status">Loading module settings…</p>
  if (error) return <div className="rounded-xl border border-destructive/25 bg-card p-6 text-center" role="alert"><h1 className="text-xl font-semibold">Module settings unavailable</h1><p className="mt-2 text-muted-foreground">{error}</p></div>
  if (!business) return <div className="rounded-xl border border-border bg-card p-6 text-center"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p className="mt-2 text-muted-foreground">Sign in to a business workspace to view its modules.</p></div>

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <PageHeader description={`Choose which optional tools are enabled for ${business.name}. Turning a module off hides it from navigation; it does not delete business data.`} eyebrow="Workspace settings" title="Modules" />

      <section aria-labelledby="workspace-management-title" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div><h2 className="text-lg font-semibold" id="workspace-management-title">Businesses &amp; workspaces</h2><p className="mt-1 text-sm text-muted-foreground">Switch between the active businesses you can access or create another one.</p></div>
        <div className="mt-4 space-y-2">{businesses.map((item) => <button className={`flex w-full items-center justify-between rounded-md border p-3 text-left text-sm ${item.id === business.id ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted"}`} key={item.id} onClick={() => { if (item.id !== business.id) void switchBusiness(item.id) }} type="button"><span><span className="block font-medium">{item.name}</span><span className="text-xs capitalize text-muted-foreground">{item.role}{item.id === business.id ? " · Active" : ""}</span></span><BusinessIcon className="size-4 text-primary" id={item.iconId} /></button>)}</div>
        {role === "owner" && <Button asChild className="mt-4" size="sm" variant="outline"><Link to="/businesses/new">Create business</Link></Button>}
      </section>

      <section aria-labelledby="business-identity-title" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div><h2 className="text-lg font-semibold" id="business-identity-title">Business identity</h2><p className="mt-1 text-sm text-muted-foreground">Customize this workspace with a logo or built-in fallback icon. StockPilot branding stays separate.</p></div>
        <div className="mt-4 flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center">
          <BusinessLogo className="size-16 rounded-lg" iconId={business.iconId} name={business.name} path={business.logoPath} src={logoPreview} />
          <div className="min-w-0 flex-1"><p className="font-medium">Business logo</p><p className="mt-1 text-sm text-muted-foreground">JPEG, PNG, or WebP up to 5 MB. This logo appears only in this workspace.</p><div className="mt-3 flex flex-wrap gap-2"><button className="min-h-10 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50" disabled={!canManage || Boolean(pendingModule)} onClick={() => logoInputRef.current?.click()} type="button">{business.logoPath ? "Change logo" : "Upload logo"}</button>{business.logoPath && <button className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" disabled={!canManage || Boolean(pendingModule)} onClick={() => { setUpdateError(""); void removeBusinessLogo().catch((cause) => setUpdateError(cause instanceof Error ? cause.message : "We couldn't remove the business logo. Please try again.")) }} type="button">Remove</button>}<input accept="image/jpeg,image/png,image/webp" className="sr-only" ref={logoInputRef} onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseBusinessLogo(file) }} type="file" /></div></div>
        </div>
        {!canManage && <p className="mt-3 text-sm text-muted-foreground">Only the business owner can change or remove the business logo.</p>}
        <div aria-label="Business icon choices" className="mt-4 flex flex-wrap gap-2" role="group">
          {businessIconOptions.map((option) => (
            <button aria-label={option.label} aria-pressed={business.iconId === option.id} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium ${business.iconId === option.id ? "border-primary/40 bg-primary/5 text-primary" : "border-border hover:bg-muted"}`} disabled={!canManage || Boolean(pendingModule)} key={option.id} onClick={() => void chooseBusinessIcon(option.id)} type="button">
              <BusinessIcon className="size-4" id={option.id} />{option.label}
            </button>
          ))}
        </div>
        {!canManage && <p className="mt-4 text-sm text-muted-foreground">Only the business owner can change the business icon.</p>}
        <div className="mt-5 border-t border-border pt-5"><label className="block text-sm font-medium" htmlFor="business-currency">Business currency</label><select className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3 text-sm sm:max-w-md" disabled={!canManage || isCurrencySaving || hasFinancialActivity} id="business-currency" onChange={(event) => void chooseCurrency(event.target.value as BusinessCurrency)} value={business.currency}>{currencyOptions.map((option) => <option key={option.code} value={option.code}>{option.code} — {option.name} ({option.symbol})</option>)}</select><p className="mt-2 text-xs text-muted-foreground">{hasFinancialActivity ? "Currency cannot be changed after financial activity has been recorded." : "Choose carefully: changing this updates labels and formatting only; it does not convert existing monetary amounts."}</p></div>
      </section>

      <section aria-labelledby="core-modules-title" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold" id="core-modules-title">Core</h2><p className="mt-1 text-sm text-muted-foreground">Always available to this workspace.</p></div>
          <Badge variant="primary">Core</Badge>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-border p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackageCheck aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0 flex-1"><h3 className="font-medium">Inventory</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Products, stock levels, and movement history.</p></div>
          <span className="shrink-0 text-sm font-medium">Always enabled</span>
        </div>
      </section>

      <section aria-labelledby="optional-modules-title" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div><h2 className="text-lg font-semibold" id="optional-modules-title">Optional modules</h2><p className="mt-1 text-sm text-muted-foreground">Enabled modules appear in workspace navigation. Sales is available; other optional tools are coming soon.</p></div>
        {updateError && <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{updateError}</p>}
        <ul className="mt-4 divide-y divide-border">
          {optionalModules.map((module) => {
            const enabled = enabledModules.includes(module.key)
            const pending = pendingModule === module.key
            const availability = module.key === "sales" || module.key === "expenses" || module.key === "analytics" || module.key === "ai_analyst" ? "Available" : "Coming soon"
            return (
              <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center" key={module.key}>
                <div className="min-w-0 flex-1"><h3 className="break-words font-medium">{module.label}</h3><p className="mt-1 break-words text-sm leading-5 text-muted-foreground">{module.description}</p><p className="mt-2 text-xs text-muted-foreground">{enabled ? "Enabled" : "Disabled"} · {availability}</p></div>
                {canManage ? <button aria-checked={enabled} aria-label={`${module.label} module`} className={`inline-flex min-h-11 min-w-28 items-center justify-center gap-2 self-start rounded-md border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-60 sm:self-auto ${enabled ? "border-primary/30 bg-primary/5" : "border-border bg-background hover:bg-muted"}`} disabled={Boolean(pendingModule)} onClick={() => void toggleModule(module.key, !enabled)} role="switch" type="button">{pending ? "Saving…" : enabled ? <><Check aria-hidden="true" className="size-4" />Enabled</> : "Enable"}</button> : <span className="shrink-0 text-sm text-muted-foreground">{enabled ? "Enabled" : "Disabled"} · {availability}</span>}
              </li>
            )
          })}
        </ul>
        <p aria-live="polite" className="sr-only" role="status">{pendingModule ? `Saving ${optionalModules.find((module) => module.key === pendingModule)?.label ?? "module"} settings.` : ""}</p>
        {!canManage && <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">Only the business owner can change module settings.</p>}
      </section>
    </section>
  )
}
