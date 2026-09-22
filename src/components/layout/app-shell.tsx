import { Boxes, LogOut } from "lucide-react"
import { useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/auth-context"
import { useBusiness } from "@/features/business/business-context"
import { getModuleLabel } from "@/features/business/modules"

export function AppShell() {
  const { session, signOut } = useAuth()
  const { business, enabledModules } = useBusiness()
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState("")

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setSignOutError("")
    try {
      await signOut()
      navigate("/login", { replace: true })
    } catch {
      setSignOutError("We couldn't sign you out. Please try again.")
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link className="flex items-center gap-2 text-lg font-semibold tracking-tight" to={session ? "/dashboard" : "/"}>
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Boxes aria-hidden="true" className="size-4" />
            </span>
            <span className="hidden sm:inline">StockPilot</span>
          </Link>
          <nav aria-label="Account navigation" className="flex items-center gap-3 text-sm">
            {!session && (
              <NavLink
                className={({ isActive }) => isActive ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
                end
                to="/"
              >
                Home
              </NavLink>
            )}
            {session ? (
              <>
                {business && <span className="hidden max-w-48 truncate text-muted-foreground md:inline" title={business.name}>{business.name}</span>}
                <Button disabled={isSigningOut} onClick={handleSignOut} size="sm" variant="outline">
                  <LogOut aria-hidden="true" className="size-4" />
                  <span className="ml-2">{isSigningOut ? "Signing out…" : "Sign out"}</span>
                </Button>
              </>
            ) : (
              <>
                <Link className="text-muted-foreground hover:text-foreground" to="/login">Sign in</Link>
                <Button asChild size="sm"><Link to="/signup">Get started</Link></Button>
              </>
            )}
          </nav>
        </div>
        {signOutError && <p className="mx-auto max-w-6xl px-4 pb-3 text-right text-sm text-destructive" role="alert">{signOutError}</p>}
        {session && business && (
          <nav aria-label="Workspace navigation" className="border-t border-border">
            <div className="mx-auto flex max-w-6xl items-center gap-5 overflow-x-auto px-4 py-3 text-sm sm:px-6">
              <NavLink className={({ isActive }) => isActive ? "shrink-0 font-medium text-primary" : "shrink-0 text-muted-foreground hover:text-foreground"} to="/dashboard">Dashboard</NavLink>
              <span aria-disabled="true" className="shrink-0 text-foreground" title="Inventory screens are coming soon">Inventory</span>
              {enabledModules.map((module) => (
                <span aria-disabled="true" className="flex shrink-0 items-center gap-1.5 text-muted-foreground" key={module} title={`${getModuleLabel(module)} is coming soon`}>
                  {getModuleLabel(module)}
                  <span aria-hidden="true" className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Soon</span>
                  <span className="sr-only">, coming soon</span>
                </span>
              ))}
            </div>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
    </div>
  )
}
