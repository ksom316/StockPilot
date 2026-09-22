import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/features/auth/auth-context"

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
        Restoring your session…
      </div>
    </div>
  )
}

export function RequireAuth() {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <AuthLoadingScreen />
  if (!session) return <Navigate replace state={{ from: location }} to="/login" />

  return <Outlet />
}

export function PublicOnly() {
  const { session, isLoading } = useAuth()

  if (isLoading) return <AuthLoadingScreen />
  if (session) return <Navigate replace to="/dashboard" />

  return <Outlet />
}
