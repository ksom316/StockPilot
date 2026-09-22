import { PackageCheck } from "lucide-react"

import { useAuth } from "@/features/auth/auth-context"

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Dashboard</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome to StockPilot</h1>
        <p className="mt-2 text-muted-foreground">Signed in as {user?.email}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PackageCheck aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-5 text-xl font-semibold">Your account is ready</h2>
        <p className="mt-2 max-w-xl leading-6 text-muted-foreground">
          Business setup and inventory tools will be introduced in the next phase. No onboarding status is assumed yet.
        </p>
      </div>
    </section>
  )
}
