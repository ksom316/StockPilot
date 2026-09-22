import { X } from "lucide-react"
import { useEffect, type PropsWithChildren } from "react"

import { Button } from "@/components/ui/button"

interface DialogShellProps extends PropsWithChildren {
  title: string
  description: string
  onClose: () => void
  wide?: boolean
}

export function DialogShell({ title, description, onClose, wide = false, children }: DialogShellProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-0 sm:items-center sm:p-4" role="presentation">
      <section aria-describedby="dialog-description" aria-labelledby="dialog-title" aria-modal="true" className={`max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-card p-5 shadow-xl sm:rounded-xl sm:p-7 ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`} role="dialog">
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
