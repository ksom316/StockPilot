import { Bell, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom"

import { AccountMenu } from "@/components/layout/account-menu"
import { BrandMark } from "@/components/brand/brand-mark"
import { buildNavGroups } from "@/components/layout/nav-config"
import { NavList } from "@/components/layout/nav-list"
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/auth-context"
import { useBusiness } from "@/features/business/business-context"
import { useNotificationSummary } from "@/features/notifications/notification-queries"
import { BusinessIcon } from "@/features/business/business-icons"
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"
import { useProfileIdentity } from "@/features/profile/profile-identity"

export function AppShell() {
  const { session, user, signOut } = useAuth()
  const { business, enabledModules, role } = useBusiness()
  const { avatarId, isUpdating: isUpdatingAvatar, updateAvatar } = useProfileIdentity(user?.id ?? null)
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
                <BrandMark className="size-7 rounded-md" decorative />
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
        className={`hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex ${collapsed ? "w-[76px]" : "w-64"}`}
      >
        <div className={`flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4 ${collapsed ? "justify-center px-0" : ""}`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <BrandMark className="size-7 rounded-md" decorative />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight tracking-tight text-sidebar-accent-foreground">StockPilot</span>
                <WorkspaceSwitcher />
              </span>
            )}
            {collapsed && <WorkspaceSwitcher collapsed />}
          </div>
        </div>
        <NavList collapsed={collapsed} groups={navGroups} />
        <div className="border-t border-sidebar-border p-2">
          <Button
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={`w-full text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${collapsed ? "justify-center px-0" : "justify-start"}`}
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
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              aria-label="Open navigation menu"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              size="icon"
              variant="ghost"
            >
              <Menu aria-hidden="true" className="size-5" />
            </Button>
            <span className="min-w-0 lg:hidden"><WorkspaceSwitcher /></span>
            <span className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground lg:flex"><BusinessIcon className="size-4" id={business.iconId} />Workspace: <span className="font-medium text-foreground">{business.name}</span></span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
            <AccountMenu avatarId={avatarId} isSigningOut={isSigningOut} isUpdatingAvatar={isUpdatingAvatar} label={user?.email ?? "Your account"} onAvatarChange={(nextAvatarId) => void updateAvatar(nextAvatarId)} onSignOut={() => void handleSignOut()} />
          </div>
        </header>
        {signOutError && <p className="border-b border-border bg-card px-4 py-2 text-right text-sm text-destructive sm:px-6" role="alert">{signOutError}</p>}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>

      <MobileNavDrawer businessName={business.name} groups={navGroups} onClose={() => setMobileNavOpen(false)} open={mobileNavOpen} />
    </div>
  )
}
