import { CheckCircle2, PackageCheck } from "lucide-react"

import { useAuth } from "@/features/auth/auth-context"
import { useBusiness } from "@/features/business/business-context"
import { getModuleLabel } from "@/features/business/modules"

export function DashboardPage() {
  const { user } = useAuth()
  const { business, role, enabledModules } = useBusiness()

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">Dashboard</p>
        <h1 className="mt-1 break-words text-3xl font-semibold tracking-tight">Welcome to {business?.name ?? "your workspace"}</h1>
        <p className="mt-2 break-words text-muted-foreground">
          {business?.businessType ? `${business.businessType} workspace · ` : "Business workspace · "}Signed in as {user?.email}
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><CheckCircle2 aria-hidden="true" className="size-6" /></span>
          <h2 className="mt-5 text-xl font-semibold">Workspace setup complete</h2>
          <p className="mt-2 max-w-xl leading-6 text-muted-foreground">Your role is <span className="font-medium capitalize text-foreground">{role}</span>. StockPilot is ready with the tools selected for this business.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Active tools</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center gap-3"><PackageCheck aria-hidden="true" className="size-5 text-primary" /><span>Inventory</span><span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Core</span></li>
            {enabledModules.map((module) => <li className="flex items-center gap-3" key={module}><CheckCircle2 aria-hidden="true" className="size-5 text-primary" />{getModuleLabel(module)}</li>)}
          </ul>
          {enabledModules.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No optional modules enabled.</p>}
        </div>
      </div>
    </section>
  )
}
