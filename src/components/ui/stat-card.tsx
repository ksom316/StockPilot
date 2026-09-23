import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: ReactNode
  help?: string
  icon?: LucideIcon
  to?: string
  tone?: "neutral" | "warning" | "destructive"
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "",
  warning: "text-warning-foreground",
  destructive: "text-destructive",
}

/** Compact metric tile used for dashboard-style counts and figures. */
export function StatCard({ label, value, help, icon: Icon, to, tone = "neutral" }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && <Icon aria-hidden="true" className="size-4 text-muted-foreground" />}
      </div>
      <span className={cn("mt-1.5 block text-2xl font-semibold tabular-nums", toneClasses[tone])}>{value}</span>
      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
    </>
  )

  const className = "block rounded-lg border border-border bg-card p-4 outline-none"

  if (to) {
    return (
      <Link aria-label={`${label}: ${value}`} className={cn(className, "transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring")} to={to}>
        {content}
      </Link>
    )
  }

  return <div className={className}>{content}</div>
}
