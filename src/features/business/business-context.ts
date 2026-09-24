import { createContext, useContext } from "react"

import type { OptionalModule } from "@/features/business/modules"
import type { BusinessIconId } from "@/features/business/business-icons"
import type { BusinessCurrency } from "@/features/business/currency"

export interface Business {
  id: string
  name: string
  businessType: string | null
  currency: BusinessCurrency
  timezone: string
  iconId: BusinessIconId
  logoPath: string | null
}

export interface Membership {
  id: string
  businessId: string
  role: "owner" | "manager" | "employee" | "cashier"
  status: "active"
}

export interface AccessibleBusiness extends Business {
  membershipId: string
  role: Membership["role"]
}

export interface CompleteOnboardingInput {
  name: string
  businessType: string | null
  enabledModules: OptionalModule[]
  iconId: BusinessIconId
  currency: BusinessCurrency
}

export type CreateBusinessInput = CompleteOnboardingInput

export interface BusinessContextValue {
  businesses: AccessibleBusiness[]
  business: Business | null
  membership: Membership | null
  role: Membership["role"] | null
  enabledModules: OptionalModule[]
  hasFinancialActivity: boolean
  isLoading: boolean
  onboardingRequired: boolean
  error: string | null
  refresh: () => Promise<void>
  switchBusiness: (businessId: string) => Promise<void>
  completeOnboarding: (input: CompleteOnboardingInput) => Promise<void>
  createBusiness: (input: CreateBusinessInput) => Promise<void>
  setModuleEnabled: (module: OptionalModule, enabled: boolean) => Promise<void>
  setBusinessIcon: (iconId: BusinessIconId) => Promise<void>
  setBusinessLogo: (file: File) => Promise<void>
  removeBusinessLogo: () => Promise<void>
  setBusinessCurrency: (currency: BusinessCurrency) => Promise<void>
}

export const BusinessContext = createContext<BusinessContextValue | undefined>(undefined)

export function useBusiness() {
  const context = useContext(BusinessContext)
  if (!context) throw new Error("useBusiness must be used within a BusinessProvider")
  return context
}
