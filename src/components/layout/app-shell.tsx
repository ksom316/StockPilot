import { Bell, Boxes, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom"

import { AccountMenu } from "@/components/layout/account-menu"
import { buildNavGroups } from "@/components/layout/nav-config"
import { NavList } from "@/components/layout/nav-list"
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/auth-context"
import { useBusiness } from "@/features/business/business-context"
import { useNotificationSummary } from "@/features/notifications/notification-queries"

export function AppShell() {
  const { session, user, signOut } = useAuth()
  const { business, enabledModules, role } = useBusiness()
  const notificationItems = useNotificationSummary()
  const unreadNotificationCount = notificationItems.filter((item) => !item.readAt).length
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState("")
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const navGroups = useMemo(
    () => (session && business ? buildNavGroups(enabledModules, role) : []),
    [session, business, enabledModules, role],
  )

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

  if (!session || !business) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card">
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
                <Button disabled={isSigningOut} onClick={handleSignOut} size="sm" variant="outline">
                  {isSigningOut ? "Signing out…" : "Sign out"}
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={`hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex ${collapsed ? "w-[68px]" : "w-64"}`}
      >
        <div className={`flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4 ${collapsed ? "justify-center px-0" : ""}`}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Boxes aria-hidden="true" className="size-4" />
          </span>
          {!collapsed && (
            <Link className="min-w-0 outline-none" to="/dashboard">
              <p className="text-sm font-semibold tracking-tight text-sidebar-accent-foreground">StockPilot</p>
              <p className="truncate text-xs text-sidebar-muted-foreground" title={business.name}>{business.name}</p>
            </Link>
          )}
        </div>
        <NavList collapsed={collapsed} groups={navGroups} />
        <div className="border-t border-sidebar-border p-2">
          <Button
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={`w-full text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${collapsed ? "justify-center px-0" : "justify-start"}`}
            onClick={() => setCollapsed((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="size-4" /> : <PanelLeftClose aria-hidden="true" className="size-4" />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              aria-label="Open navigation menu"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              size="icon"
              variant="ghost"
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
            <span className="truncate text-sm font-medium text-muted-foreground lg:hidden" title={business.name}>{business.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ""}`} asChild className="relative" size="icon" variant="ghost">
              <Link to="/notifications">
                <Bell aria-hidden="true" className="size-4" />
                {Boolean(unreadNotificationCount) && (
                  <span aria-hidden="true" className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </span>
                )}
              </Link>
            </Button>
            <AccountMenu isSigningOut={isSigningOut} label={user?.email ?? "Your account"} onSignOut={() => void handleSignOut()} />
          </div>
        </header>
        {signOutError && <p className="border-b border-border bg-card px-4 py-2 text-right text-sm text-destructive sm:px-6" role="alert">{signOutError}</p>}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>

      {mobileNavOpen && <MobileNavDrawer businessName={business.name} groups={navGroups} onClose={() => setMobileNavOpen(false)} />}
    </div>
  )
}
