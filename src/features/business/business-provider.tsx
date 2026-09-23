import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react"

import { useAuth } from "@/features/auth/auth-context"
import { BusinessContext, type AccessibleBusiness, type Business, type BusinessContextValue, type CompleteOnboardingInput, type Membership } from "@/features/business/business-context"
import type { BusinessIconId } from "@/features/business/business-icons"
import type { BusinessCurrency } from "@/features/business/currency"
import type { OptionalModule } from "@/features/business/modules"
import { supabase } from "@/lib/supabase"

const activeBusinessStorageKey = "stockpilot.active-business"

interface WorkspaceState {
  resolvedUserId: string | null
  businesses: AccessibleBusiness[]
  business: Business | null
  membership: Membership | null
  enabledModules: OptionalModule[]
  hasFinancialActivity: boolean
  error: string | null
}

const emptyState: WorkspaceState = { resolvedUserId: null, businesses: [], business: null, membership: null, enabledModules: [], hasFinancialActivity: false, error: null }

function readPreferredBusinessId() { try { return window.localStorage.getItem(activeBusinessStorageKey) } catch { return null } }
function writePreferredBusinessId(id: string) { try { window.localStorage.setItem(activeBusinessStorageKey, id) } catch { /* preference only */ } }

export function BusinessProvider({ children }: PropsWithChildren) {
  const { user, isLoading: isAuthLoading } = useAuth()
  const [state, setState] = useState<WorkspaceState>(emptyState)
  const [isSwitching, setIsSwitching] = useState(false)
  const requestIdRef = useRef(0)

  const resolveBusiness = useCallback(async (options?: { suppressError?: boolean; preferredBusinessId?: string }): Promise<Business | null> => {
    const requestId = ++requestIdRef.current
    if (!user || !supabase) { setState(emptyState); return null }
    const { data: membershipData, error: membershipError } = await supabase.from("business_members").select("id, business_id, role, status, businesses(id, name, business_type, currency, timezone, icon_id)").eq("user_id", user.id).eq("status", "active")
    if (membershipError) {
      if (requestId !== requestIdRef.current) return null
      setState({ ...emptyState, resolvedUserId: user.id, error: options?.suppressError ? null : "We couldn't load your workspaces. Please try again." })
      return null
    }
    const accessibleBusinesses = (membershipData ?? []).map((membership) => {
      const related = membership.businesses as unknown as { id: string; name: string; business_type: string | null; currency: BusinessCurrency; timezone: string; icon_id?: BusinessIconId | null }
      return { id: related.id, name: related.name, businessType: related.business_type, currency: related.currency, timezone: related.timezone, iconId: related.icon_id ?? "store", membershipId: membership.id, role: membership.role as Membership["role"] }
    })
    if (accessibleBusinesses.length === 0) {
      if (requestId !== requestIdRef.current) return null
      setState({ ...emptyState, resolvedUserId: user.id })
      return null
    }
    const preferred = options?.preferredBusinessId ?? readPreferredBusinessId()
    const activeWorkspace = accessibleBusinesses.find((item) => item.id === preferred) ?? accessibleBusinesses[0]
    const { data: moduleData, error: moduleError } = await supabase.from("business_modules").select("module").eq("business_id", activeWorkspace.id).eq("enabled", true)
    if (moduleError) {
      if (requestId !== requestIdRef.current) return null
      setState({ ...emptyState, resolvedUserId: user.id, businesses: accessibleBusinesses, error: options?.suppressError ? null : "We couldn't load your workspace modules. Please try again." })
      return null
    }
    const financialActivityResponse = await supabase.rpc("get_business_financial_activity", { p_business_id: activeWorkspace.id })
    if (financialActivityResponse?.error) {
      if (requestId !== requestIdRef.current) return null
      setState({ ...emptyState, resolvedUserId: user.id, businesses: accessibleBusinesses, error: options?.suppressError ? null : "We couldn't load your workspace activity. Please try again." })
      return null
    }
    if (requestId !== requestIdRef.current) return null
    const business: Business = { id: activeWorkspace.id, name: activeWorkspace.name, businessType: activeWorkspace.businessType, currency: activeWorkspace.currency, timezone: activeWorkspace.timezone, iconId: activeWorkspace.iconId }
    setState({ resolvedUserId: user.id, businesses: accessibleBusinesses, business, membership: { id: activeWorkspace.membershipId, businessId: activeWorkspace.id, role: activeWorkspace.role, status: "active" }, enabledModules: (moduleData ?? []).map((item) => item.module as OptionalModule), hasFinancialActivity: Boolean(financialActivityResponse?.data), error: null })
    writePreferredBusinessId(business.id)
    return business
  }, [user])

  useEffect(() => {
    // Workspace membership is remote state; resolve it when the authenticated identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void resolveBusiness()
    return () => { requestIdRef.current += 1 }
  }, [resolveBusiness])

  const switchBusiness = useCallback(async (businessId: string) => {
    setIsSwitching(true)
    setState((current) => ({ ...current, business: null, membership: null, enabledModules: [], error: null }))
    try {
      const resolved = await resolveBusiness({ preferredBusinessId: businessId })
      if (!resolved || resolved.id !== businessId) throw new Error("That workspace is no longer available.")
    } finally {
      setIsSwitching(false)
    }
  }, [resolveBusiness])

  const completeOnboarding = useCallback(async (input: CompleteOnboardingInput) => {
    if (!user || !supabase) throw new Error("Your session is no longer available. Please sign in again.")
    const { error } = await supabase.rpc("create_business_onboarding", { p_name: input.name, p_business_type: input.businessType, p_enabled_modules: input.enabledModules, p_icon_id: input.iconId, p_currency: input.currency })
    if (error) {
      const isAlreadyOnboardedConflict = error.code === "23505" && /active business membership already exists/i.test(error.message ?? "")
      if (isAlreadyOnboardedConflict && await resolveBusiness({ suppressError: true })) return
      throw new Error("We couldn't finish your business setup. Please try again.")
    }
    await resolveBusiness()
  }, [resolveBusiness, user])

  const createBusiness = useCallback(async (input: CompleteOnboardingInput) => {
    if (!user || !supabase) throw new Error("Your session is no longer available. Please sign in again.")
    const { error } = await supabase.rpc("create_additional_business", { p_name: input.name, p_business_type: input.businessType, p_enabled_modules: input.enabledModules, p_icon_id: input.iconId, p_currency: input.currency })
    if (error) throw new Error("We couldn't create that business. Check the details and try again.")
    await resolveBusiness()
  }, [resolveBusiness, user])

  const resolvedState = user && state.resolvedUserId === user.id ? state : emptyState
  const setModuleEnabled = useCallback(async (module: OptionalModule, enabled: boolean) => {
    const currentBusiness = resolvedState.business
    if (!user || !supabase || !currentBusiness) throw new Error("Your workspace is unavailable. Refresh and try again.")
    if (resolvedState.membership?.role !== "owner") throw new Error("Only the business owner can change modules.")
    const { data, error } = await supabase.from("business_modules").update({ enabled }).eq("business_id", currentBusiness.id).eq("module", module).select("module, enabled").maybeSingle()
    if (error || !data) throw new Error("We couldn't update this module. Confirm your owner access and try again.")
    await resolveBusiness({ preferredBusinessId: currentBusiness.id })
  }, [resolveBusiness, resolvedState, user])

  const setBusinessIcon = useCallback(async (iconId: BusinessIconId) => {
    const currentBusiness = resolvedState.business
    if (!user || !supabase || !currentBusiness) throw new Error("Your workspace is unavailable. Refresh and try again.")
    if (resolvedState.membership?.role !== "owner") throw new Error("Only the business owner can change the business icon.")
    const { error } = await supabase.from("businesses").update({ icon_id: iconId }).eq("id", currentBusiness.id)
    if (error) throw new Error("We couldn't update the business icon. Confirm your owner access and try again.")
    await resolveBusiness({ preferredBusinessId: currentBusiness.id })
  }, [resolveBusiness, resolvedState, user])

  const setBusinessCurrency = useCallback(async (currency: BusinessCurrency) => {
    const currentBusiness = resolvedState.business
    if (!user || !supabase || !currentBusiness) throw new Error("Your workspace is unavailable. Refresh and try again.")
    if (resolvedState.membership?.role !== "owner") throw new Error("Only the business owner can change the business currency.")
    const { error } = await supabase.from("businesses").update({ currency }).eq("id", currentBusiness.id)
    if (error) throw new Error("We couldn't update the business currency. Confirm your owner access and try again.")
    await resolveBusiness({ preferredBusinessId: currentBusiness.id })
  }, [resolveBusiness, resolvedState, user])

  const isLoading = isAuthLoading || isSwitching || Boolean(user && state.resolvedUserId !== user.id)
  const value = useMemo<BusinessContextValue>(() => ({ businesses: resolvedState.businesses, business: resolvedState.business, membership: resolvedState.membership, role: resolvedState.membership?.role ?? null, enabledModules: resolvedState.enabledModules, hasFinancialActivity: resolvedState.hasFinancialActivity, isLoading, onboardingRequired: Boolean(user && !isLoading && !resolvedState.business && !resolvedState.error), error: resolvedState.error, refresh: async () => { await resolveBusiness() }, switchBusiness, completeOnboarding, createBusiness, setModuleEnabled, setBusinessIcon, setBusinessCurrency }), [completeOnboarding, createBusiness, isLoading, resolveBusiness, resolvedState, setBusinessCurrency, setBusinessIcon, setModuleEnabled, switchBusiness, user])
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}
