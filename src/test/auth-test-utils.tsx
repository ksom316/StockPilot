/* eslint-disable react-refresh/only-export-components -- shared Vitest-only helpers */
import type { Session, User } from "@supabase/supabase-js"
import type { PropsWithChildren } from "react"
import { vi } from "vitest"

import { AuthContext, type AuthContextValue } from "@/features/auth/auth-context"
import { BusinessContext, type BusinessContextValue } from "@/features/business/business-context"

export const testUser = {
  id: "user-1",
  email: "owner@example.com",
  user_metadata: { display_name: "Alex Morgan" },
} as unknown as User

export const testSession = {
  access_token: "test-token",
  refresh_token: "test-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: testUser,
} as Session

export function createAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    session: null,
    isLoading: false,
    initializationError: null,
    retryInitialization: vi.fn(),
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  }
}

export function TestAuthProvider({ children, value }: PropsWithChildren<{ value: AuthContextValue }>) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const testBusiness = {
  id: "business-1",
  name: "Northstar Market",
  businessType: "Retail",
  currency: "USD",
}

export const testMembership = {
  id: "membership-1",
  businessId: "business-1",
  role: "owner" as const,
  status: "active" as const,
}

export function createBusinessValue(overrides: Partial<BusinessContextValue> = {}): BusinessContextValue {
  return {
    business: null,
    membership: null,
    role: null,
    enabledModules: [],
    isLoading: false,
    onboardingRequired: true,
    error: null,
    refresh: vi.fn(),
    completeOnboarding: vi.fn(),
    setModuleEnabled: vi.fn(),
    ...overrides,
  }
}

export function TestBusinessProvider({ children, value }: PropsWithChildren<{ value: BusinessContextValue }>) {
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}
