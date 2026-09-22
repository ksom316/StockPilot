import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/features/auth/auth-context"
import { useBusiness } from "@/features/business/business-context"
import type { OptionalModule } from "@/features/business/modules"

export function RouteLoadingScreen({ message = "Loading your workspace…" }: { message?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
        {message}
      </div>
    </div>
  )
}

export function RequireAuth() {
  const { session, isLoading, initializationError, retryInitialization } = useAuth()
  const location = useLocation()

  if (isLoading) return <RouteLoadingScreen message="Restoring your session…" />
  if (initializationError) return <AuthInitializationError message={initializationError} onRetry={retryInitialization} />
  if (!session) return <Navigate replace state={{ from: location }} to="/login" />

  return <Outlet />
}

export function PublicOnly() {
  const { session, isLoading, initializationError, retryInitialization } = useAuth()

  if (isLoading) return <RouteLoadingScreen message="Restoring your session…" />
  if (initializationError) return <AuthInitializationError message={initializationError} onRetry={retryInitialization} />
  if (session) return <Navigate replace to="/dashboard" />

  return <Outlet />
}

function AuthInitializationError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="mx-auto max-w-lg rounded-xl border border-destructive/25 bg-card p-6 text-center shadow-sm" role="alert">
      <h1 className="text-xl font-semibold">Session unavailable</h1>
      <p className="mt-2 text-muted-foreground">{message}</p>
      <button className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" onClick={onRetry} type="button">
        Try again
      </button>
    </section>
  )
}

function WorkspaceError() {
  const { error, refresh } = useBusiness()
  if (!error) return null

  return (
    <section className="mx-auto max-w-lg rounded-xl border border-destructive/25 bg-card p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold">Workspace unavailable</h1>
      <p className="mt-2 text-muted-foreground">{error}</p>
      <button className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" onClick={() => void refresh()} type="button">
        Try again
      </button>
    </section>
  )
}

export function RequireBusiness() {
  const { business, isLoading, error } = useBusiness()

  if (isLoading) return <RouteLoadingScreen />
  if (error) return <WorkspaceError />
  if (!business) return <Navigate replace to="/onboarding" />

  return <Outlet />
}

export function RequireModule({ module }: { module: OptionalModule }) {
  const { enabledModules, isLoading } = useBusiness()

  if (isLoading) return <RouteLoadingScreen message="Checking available modules…" />
  if (!enabledModules.includes(module)) return <Navigate replace to="/dashboard" />

  return <Outlet />
}

export function OnboardingOnly() {
  const { business, isLoading, error } = useBusiness()

  if (isLoading) return <RouteLoadingScreen />
  if (error) return <WorkspaceError />
  if (business) return <Navigate replace to="/dashboard" />

  return <Outlet />
}
