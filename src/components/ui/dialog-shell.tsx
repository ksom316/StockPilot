import { X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, type PropsWithChildren } from "react"

import { Button } from "@/components/ui/button"

interface DialogShellProps extends PropsWithChildren {
  title: string
  description: string
  onClose: () => void
  wide?: boolean
}

export function DialogShell({ title, description, onClose, wide = false, children }: DialogShellProps) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog) return

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ))
    if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus()

    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const controls = focusable()
      if (controls.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-0 sm:items-center sm:p-4" role="presentation">
      <section aria-describedby="dialog-description" aria-labelledby="dialog-title" aria-modal="true" className={`max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-card p-5 shadow-xl sm:rounded-xl sm:p-7 ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`} ref={dialogRef} role="dialog" tabIndex={-1}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold" id="dialog-title">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground" id="dialog-description">{description}</p>
          </div>
          <Button aria-label="Close dialog" className="shrink-0 px-2" onClick={onClose} size="sm" type="button" variant="outline"><X aria-hidden="true" className="size-4" /></Button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  )
}
