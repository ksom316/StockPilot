import type { Session, User } from "@supabase/supabase-js"
import { createContext, useContext } from "react"

export interface SignUpResult {
  confirmationRequired: boolean
  email: string
}

export interface AuthContextValue {
  user: User | null
  session: Session | null
  isLoading: boolean
  initializationError: string | null
  retryInitialization: () => void
  signUp: (fullName: string, email: string, password: string) => Promise<SignUpResult>
  signIn: (email: string, password: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}
