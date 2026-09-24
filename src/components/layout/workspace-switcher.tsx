import { Check, ChevronDown, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { BusinessLogo } from "@/components/branding/business-logo"
import { useBusiness } from "@/features/business/business-context"
import { useAuth } from "@/features/auth/auth-context"
import { cn } from "@/lib/utils"

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { business, businesses, switchBusiness } = useBusiness()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (businesses.length < 1 || businesses.find((item) => item.id === business?.id)?.role !== "owner") return
    // The hint preference mirrors an external local-storage preference into local UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setShowHint(window.localStorage.getItem(`stockpilot.workspace-hint.${user?.id ?? "account"}`) !== "dismissed") } catch { setShowHint(true) }
  }, [business?.id, businesses, user?.id])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape) }
  }, [open])

  if (!business) return null
  const choose = async (id: string) => {
    if (id === business.id) { setOpen(false); return }
    setIsSwitching(true)
    try { await switchBusiness(id); setOpen(false) } catch { /* the provider re-resolves the last valid workspace */ } finally { setIsSwitching(false) }
  }
  const dismissHint = () => { setShowHint(false); try { window.localStorage.setItem(`stockpilot.workspace-hint.${user?.id ?? "account"}`, "dismissed") } catch { /* preference only */ } }

  return <div className="relative min-w-0" ref={ref}>
    {showHint && !collapsed && <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-lg border border-primary/20 bg-card p-3 text-foreground shadow-md"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="text-sm font-medium">Manage multiple businesses</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Switch workspaces or create another business here.</p></div><button aria-label="Dismiss workspace hint" className="text-xs text-muted-foreground hover:text-foreground" onClick={dismissHint} type="button">Dismiss</button></div></div>}
    <button aria-expanded={open} aria-haspopup="menu" aria-label={`Current workspace: ${business.name}`} className={cn("flex w-full items-center gap-2 rounded-md p-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring", collapsed && "justify-center")} onClick={() => { setOpen((value) => !value); dismissHint() }} type="button">
      <BusinessLogo className="size-6" iconId={business.iconId} name={business.name} path={business.logoPath} />
      {!collapsed && <><span className="min-w-0 flex-1 truncate text-xs text-sidebar-muted-foreground" title={business.name}>{business.name}</span><ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-sidebar-muted-foreground" /></>}
    </button>
    {open && <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-sidebar-border bg-sidebar p-1.5 text-sidebar-foreground shadow-lg" role="menu">
      <p className="px-2.5 py-1.5 text-xs font-medium text-sidebar-muted-foreground">Your workspaces</p>
      {businesses.map((item) => <button aria-checked={item.id === business.id} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-sidebar-accent disabled:opacity-60" disabled={isSwitching} key={item.id} onClick={() => void choose(item.id)} role="menuitemradio" type="button"><BusinessLogo className="size-6" iconId={item.iconId} name={item.name} path={item.logoPath} /><span className="min-w-0 flex-1"><span className="block truncate">{item.name}</span><span className="block text-xs text-sidebar-muted-foreground capitalize">{item.role}</span></span>{item.id === business.id && <Check aria-hidden="true" className="size-4 shrink-0 text-sidebar-primary" />}</button>)}
      <div className="my-1 border-t border-sidebar-border" />
      <Link className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-sidebar-accent" onClick={() => setOpen(false)} role="menuitem" to="/businesses/new"><Plus aria-hidden="true" className="size-4" />Create business</Link>
    </div>}
  </div>
}
