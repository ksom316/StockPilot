import { Check, PackageCheck } from "lucide-react"
import { useState } from "react"

import { useBusiness } from "@/features/business/business-context"
import { optionalModules } from "@/features/business/modules"

export function ModuleSettingsPage() {
  const { business, enabledModules, isLoading, error, role, setModuleEnabled } = useBusiness()
  const [pendingModule, setPendingModule] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState("")
  const canManage = role === "owner"

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

  if (isLoading) return <p className="flex min-h-56 items-center justify-center text-sm text-muted-foreground" role="status">Loading module settings…</p>
  if (error) return <div className="rounded-xl border border-destructive/25 bg-card p-6 text-center" role="alert"><h1 className="text-xl font-semibold">Module settings unavailable</h1><p className="mt-2 text-muted-foreground">{error}</p></div>
  if (!business) return <div className="rounded-xl border border-border bg-card p-6 text-center"><h1 className="text-xl font-semibold">Workspace unavailable</h1><p className="mt-2 text-muted-foreground">Sign in to a business workspace to view its modules.</p></div>

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Workspace settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Modules</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Choose which optional tools are enabled for {business.name}. Turning a module off hides it from navigation; it does not delete business data.</p>
      </header>

      <section aria-labelledby="core-modules-title" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold" id="core-modules-title">Core</h2><p className="mt-1 text-sm text-muted-foreground">Always available to this workspace.</p></div>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Core</span>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-border p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackageCheck aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0 flex-1"><h3 className="font-medium">Inventory</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Products, stock levels, and movement history.</p></div>
          <span className="shrink-0 text-sm font-medium">Always enabled</span>
        </div>
      </section>

      <section aria-labelledby="optional-modules-title" className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div><h2 className="text-lg font-semibold" id="optional-modules-title">Optional modules</h2><p className="mt-1 text-sm text-muted-foreground">Enabled modules appear in workspace navigation. Their features are still being built.</p></div>
        {updateError && <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{updateError}</p>}
        <ul className="mt-4 divide-y divide-border">
          {optionalModules.map((module) => {
            const enabled = enabledModules.includes(module.key)
            const pending = pendingModule === module.key
            return (
              <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center" key={module.key}>
                <div className="min-w-0 flex-1"><h3 className="break-words font-medium">{module.label}</h3><p className="mt-1 break-words text-sm leading-5 text-muted-foreground">{module.description}</p><p className="mt-2 text-xs text-muted-foreground">{enabled ? "Enabled" : "Disabled"} · Coming soon</p></div>
                {canManage ? <button aria-checked={enabled} aria-label={`${module.label} module`} className={`inline-flex min-h-11 min-w-28 items-center justify-center gap-2 self-start rounded-md border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-60 sm:self-auto ${enabled ? "border-primary/30 bg-primary/5" : "border-border bg-background hover:bg-muted"}`} disabled={Boolean(pendingModule)} onClick={() => void toggleModule(module.key, !enabled)} role="switch" type="button">{pending ? "Saving…" : enabled ? <><Check aria-hidden="true" className="size-4" />Enabled</> : "Enable"}</button> : <span className="shrink-0 text-sm text-muted-foreground">{enabled ? "Enabled" : "Disabled"} · Coming soon</span>}
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
