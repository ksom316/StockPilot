import { X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef } from "react"

import type { NavGroup } from "@/components/layout/nav-config"
import { NavList } from "@/components/layout/nav-list"
import { Button } from "@/components/ui/button"

interface MobileNavDrawerProps {
  groups: NavGroup[]
  businessName: string
  onClose: () => void
}

/** Slide-in navigation drawer used on mobile/tablet in place of the persistent sidebar. */
export function MobileNavDrawer({ groups, businessName, onClose }: MobileNavDrawerProps) {
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!panel) return

    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ))
    ;(focusable()[0] ?? panel).focus()

    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const controls = focusable()
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", trapTab)
    return () => {
      document.removeEventListener("keydown", trapTab)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden" role="presentation">
      <button aria-label="Close navigation menu" className="absolute inset-0 bg-foreground/35" onClick={onClose} type="button" />
      <section
        aria-label="Mobile navigation"
        aria-modal="true"
        className="relative flex h-full w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl outline-none"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-sidebar-accent-foreground">StockPilot</p>
            <p className="truncate text-xs text-sidebar-muted-foreground" title={businessName}>{businessName}</p>
          </div>
          <Button aria-label="Close navigation menu" className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={onClose} size="icon" variant="ghost">
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <NavList groups={groups} onNavigate={onClose} />
      </section>
    </div>
  )
}
