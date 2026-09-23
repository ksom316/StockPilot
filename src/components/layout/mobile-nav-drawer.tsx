import { X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import type { NavGroup } from "@/components/layout/nav-config"
import { BrandMark } from "@/components/brand/brand-mark"
import { NavList } from "@/components/layout/nav-list"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MobileNavDrawerProps {
  open: boolean
  groups: NavGroup[]
  businessName: string
  onClose: () => void
}

/**
 * Slide-in navigation drawer used on mobile/tablet in place of the persistent sidebar.
 * Stays mounted through its own exit transition (driven by `transitionend`, not a fixed
 * timer) so opening/closing animates smoothly while still respecting reduced-motion.
 */
export function MobileNavDrawer({ open, groups, businessName, onClose }: MobileNavDrawerProps) {
  const panelRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)

  // Mount/begin-exit are derived synchronously from the `open` prop (React's documented
  // "adjust state during render" pattern) so they take effect in the same render as the
  // prop change; the enter transition itself still needs a frame delay, handled below.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setMounted(true)
    else if (!entered) setMounted(false)
    else setEntered(false)
  }

  useEffect(() => {
    if (open) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [open])

  useEffect(() => {
    if (!open || !mounted) return
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open) return
    const panel = panelRef.current
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
      if (openerRef.current?.isConnected) openerRef.current.focus()
    }
  }, [open])

  const handlePanelTransitionEnd = (event: React.TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return
    if (!entered) setMounted(false)
  }

  if (!mounted) return null

  return (
    <div className={cn("fixed inset-0 z-50 flex lg:hidden", !open && "pointer-events-none")} role="presentation">
      <button
        aria-hidden="true"
        className={cn("absolute inset-0 bg-foreground/40 transition-opacity duration-200 ease-out", entered ? "opacity-100" : "opacity-0")}
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-label="Mobile navigation"
        aria-modal="true"
        className={cn(
          "relative flex h-full w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl outline-none transition-transform duration-200 ease-out",
          entered ? "translate-x-0" : "-translate-x-full",
        )}
        onTransitionEnd={handlePanelTransitionEnd}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark className="size-8 shrink-0 rounded-md" decorative />
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight text-sidebar-accent-foreground">StockPilot</p>
              <p className="truncate text-xs text-sidebar-muted-foreground" title={businessName}>{businessName}</p>
            </div>
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
