import { LogOut, Settings2, User } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"

interface AccountMenuProps {
  label: string
  onSignOut: () => void
  isSigningOut: boolean
}

/** Compact account menu housing settings access and sign-out, used in the top header. */
export function AccountMenu({ label, onSignOut, isSigningOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${label}`}
        className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground outline-none transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <User aria-hidden="true" className="size-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-56 rounded-md border border-border bg-card p-1 shadow-md"
          role="menu"
        >
          <p className="truncate px-2.5 py-1.5 text-xs text-muted-foreground" title={label}>{label}</p>
          <Link
            className={cn(
              "flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted",
            )}
            onClick={() => setOpen(false)}
            role="menuitem"
            to="/settings/modules"
          >
            <Settings2 aria-hidden="true" className="size-4" />
            Modules &amp; settings
          </Link>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50"
            disabled={isSigningOut}
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            role="menuitem"
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  )
}
