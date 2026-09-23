import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** Standard empty-state container for lists/sections with no data yet. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center", className)}>
      {Icon && <Icon aria-hidden="true" className="size-8 text-muted-foreground" />}
      <h2 className="font-semibold text-foreground">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  title: string
  children: ReactNode
  onRetry?: () => void
  className?: string
}

/** Standard inline error container with an optional retry action. */
export function ErrorState({ title, children, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm", className)} role="alert">
      <p className="font-medium text-destructive">{title}</p>
      <p className="mt-1 text-muted-foreground">{children}</p>
      {onRetry && <Button className="mt-3" onClick={onRetry} size="sm" variant="outline">Try again</Button>}
    </div>
  )
}

/** Standard inline loading indicator for a section awaiting data. */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground", className)} role="status">{label}</p>
}

/** Skeleton block for content placeholders while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} />
}
