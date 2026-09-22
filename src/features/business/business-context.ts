import { createContext, useContext } from "react"

import type { OptionalModule } from "@/features/business/modules"

export interface Business {
  id: string
  name: string
  businessType: string | null
  currency: string
  timezone: string
}

export interface Membership {
  id: string
  businessId: string
  role: "owner" | "manager" | "employee" | "cashier"
  status: "active"
}

export interface CompleteOnboardingInput {
  name: string
  businessType: string | null
  enabledModules: OptionalModule[]
}

export interface BusinessContextValue {
  business: Business | null
  membership: Membership | null
  role: Membership["role"] | null
  enabledModules: OptionalModule[]
  isLoading: boolean
  onboardingRequired: boolean
  error: string | null
  refresh: () => Promise<void>
  completeOnboarding: (input: CompleteOnboardingInput) => Promise<void>
  setModuleEnabled: (module: OptionalModule, enabled: boolean) => Promise<void>
}

export const BusinessContext = createContext<BusinessContextValue | undefined>(undefined)

export function useBusiness() {
  const context = useContext(BusinessContext)
  if (!context) throw new Error("useBusiness must be used within a BusinessProvider")
  return context
}
