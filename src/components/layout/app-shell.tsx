import { Boxes, LogOut } from "lucide-react"
import { useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/auth-context"

export function AppShell() {
  const { session, signOut } = useAuth()
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
          <nav aria-label="Primary navigation" className="flex items-center gap-3 text-sm">
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
              <Button disabled={isSigningOut} onClick={handleSignOut} size="sm" variant="outline">
                <LogOut aria-hidden="true" className="size-4" />
                <span className="ml-2">{isSigningOut ? "Signing out…" : "Sign out"}</span>
              </Button>
            ) : (
              <>
                <Link className="text-muted-foreground hover:text-foreground" to="/login">Sign in</Link>
                <Button asChild size="sm"><Link to="/signup">Get started</Link></Button>
              </>
            )}
          </nav>
        </div>
        {signOutError && <p className="mx-auto max-w-6xl px-4 pb-3 text-right text-sm text-destructive" role="alert">{signOutError}</p>}
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
    </div>
  )
}
