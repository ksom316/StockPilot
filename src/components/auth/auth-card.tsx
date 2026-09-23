import type { PropsWithChildren, ReactNode } from "react"
import { Link } from "react-router-dom"

import { BrandMark } from "@/components/brand/brand-mark"

interface AuthCardProps extends PropsWithChildren {
  title: string
  description: string
  footer?: ReactNode
}

export function AuthCard({ title, description, footer, children }: AuthCardProps) {
  return (
    <section className="mx-auto w-full max-w-md py-4 sm:py-10">
      <div className="mb-7 text-center">
        <Link className="inline-flex items-center gap-2 font-semibold tracking-tight sm:hidden" to="/">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BrandMark className="size-7 rounded-md" decorative />
          </span>
          StockPilot
        </Link>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 leading-6 text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
      {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
    </section>
  )
}
