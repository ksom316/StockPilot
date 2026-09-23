import type { ReactNode } from "react"

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  titleId?: string
}

/**
 * Standard page-level heading used at the top of a route's content.
 * Keeps title placement, description and actions consistent across pages.
 */
export function PageHeader({ eyebrow, title, description, actions, titleId }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-primary">{eyebrow}</p>}
        <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-foreground" id={titleId}>{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

interface SectionHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  id?: string
}

/** Heading used at the top of a card/section within a page. */
export function SectionHeader({ title, description, actions, id }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground" id={id}>{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
