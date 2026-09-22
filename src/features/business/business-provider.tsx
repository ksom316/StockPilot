import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react"

import {
  BusinessContext,
  type Business,
  type BusinessContextValue,
  type CompleteOnboardingInput,
  type Membership,
} from "@/features/business/business-context"
import type { OptionalModule } from "@/features/business/modules"
import { useAuth } from "@/features/auth/auth-context"
import { supabase } from "@/lib/supabase"

interface WorkspaceState {
  resolvedUserId: string | null
  business: Business | null
  membership: Membership | null
  enabledModules: OptionalModule[]
  error: string | null
}

const emptyState: WorkspaceState = {
  resolvedUserId: null,
  business: null,
  membership: null,
  enabledModules: [],
  error: null,
}

export function BusinessProvider({ children }: PropsWithChildren) {
  const { user, isLoading: isAuthLoading } = useAuth()
  const [state, setState] = useState<WorkspaceState>(emptyState)
  const requestIdRef = useRef(0)

  const resolveBusiness = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!user || !supabase) {
      setState(emptyState)
      return
    }

    const { data: membershipData, error: membershipError } = await supabase
      .from("business_members")
      .select("id, business_id, role, status, businesses(id, name, business_type, currency)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(2)

    if (membershipError) {
      if (requestId !== requestIdRef.current) return
      setState({ ...emptyState, resolvedUserId: user.id, error: "We couldn't load your workspace. Please try again." })
      return
    }

    if (!membershipData || membershipData.length === 0) {
      if (requestId !== requestIdRef.current) return
      setState({ ...emptyState, resolvedUserId: user.id })
      return
    }

    if (membershipData.length > 1) {
      if (requestId !== requestIdRef.current) return
      setState({ ...emptyState, resolvedUserId: user.id, error: "This account has multiple workspaces. Workspace switching is not available yet." })
      return
    }

    const activeMembership = membershipData[0]

    const relatedBusiness = activeMembership.businesses as unknown as {
      id: string
      name: string
      business_type: string | null
      currency: string
    }
    const { data: moduleData, error: moduleError } = await supabase
      .from("business_modules")
      .select("module")
      .eq("business_id", activeMembership.business_id)
      .eq("enabled", true)

    if (moduleError) {
      if (requestId !== requestIdRef.current) return
      setState({ ...emptyState, resolvedUserId: user.id, error: "We couldn't load your workspace modules. Please try again." })
      return
    }

    if (requestId !== requestIdRef.current) return
    setState({
      resolvedUserId: user.id,
      business: {
        id: relatedBusiness.id,
        name: relatedBusiness.name,
        businessType: relatedBusiness.business_type,
        currency: relatedBusiness.currency,
      },
      membership: {
        id: activeMembership.id,
        businessId: activeMembership.business_id,
        role: activeMembership.role as Membership["role"],
        status: "active",
      },
      enabledModules: (moduleData ?? []).map((item) => item.module as OptionalModule),
      error: null,
    })
  }, [user])

  useEffect(() => {
    // The resolver synchronizes the authenticated identity with remote workspace state.
    // Its user-bound request id prevents stale responses from winning a session change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void resolveBusiness()
    return () => {
      requestIdRef.current += 1
    }
  }, [resolveBusiness])

  const completeOnboarding = useCallback(async (input: CompleteOnboardingInput) => {
    if (!user || !supabase) throw new Error("Your session is no longer available. Please sign in again.")

    const { error } = await supabase.rpc("create_business_onboarding", {
      p_name: input.name,
      p_business_type: input.businessType,
      p_enabled_modules: input.enabledModules,
    })
    if (error) {
      if (error.code === "23505") throw new Error("A business is already connected to this account. Refresh to continue.")
      throw new Error("We couldn't finish your business setup. Please try again.")
    }

    await resolveBusiness()
  }, [resolveBusiness, user])

  const isLoading = isAuthLoading || Boolean(user && state.resolvedUserId !== user.id)
  const resolvedState = user && state.resolvedUserId === user.id ? state : emptyState
  const value = useMemo<BusinessContextValue>(() => ({
    business: resolvedState.business,
    membership: resolvedState.membership,
    role: resolvedState.membership?.role ?? null,
    enabledModules: resolvedState.enabledModules,
    isLoading,
    onboardingRequired: Boolean(user && !isLoading && !resolvedState.business && !resolvedState.error),
    error: resolvedState.error,
    refresh: resolveBusiness,
    completeOnboarding,
  }), [completeOnboarding, isLoading, resolveBusiness, resolvedState, user])

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}
