import type { Session } from "@supabase/supabase-js"
import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react"

import { AuthContext, type AuthContextValue, type SignUpResult } from "@/features/auth/auth-context"
import { supabase } from "@/lib/supabase"

const configurationError = "Authentication is not configured. Add the local Supabase values to .env.local."

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(supabase))
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)

  const retryInitialization = useCallback(() => {
    setInitializationError(null)
    setIsLoading(Boolean(supabase))
    setRetryAttempt((attempt) => attempt + 1)
  }, [])

  useEffect(() => {
    if (!supabase) {
      return
    }

    let isMounted = true
    let receivedAuthEvent = false
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true
      if (isMounted) {
        setSession(nextSession)
        setInitializationError(null)
        setIsLoading(false)
      }
    })

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!isMounted || receivedAuthEvent) return

        if (error) {
          setSession(null)
          setInitializationError("We couldn't restore your session. Check your connection and try again.")
        } else {
          setSession(data.session)
          setInitializationError(null)
        }
        setIsLoading(false)
      })
      .catch(() => {
        if (!isMounted || receivedAuthEvent) return

        setSession(null)
        setInitializationError("We couldn't restore your session. Check your connection and try again.")
        setIsLoading(false)
      })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [retryAttempt])

  const signUp = useCallback(async (fullName: string, email: string, password: string): Promise<SignUpResult> => {
    if (!supabase) throw new Error(configurationError)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: fullName },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })

    if (error) throw error
    if (data.user?.identities?.length === 0) {
      throw new Error("An account with this email already exists. Try signing in instead.")
    }

    return { confirmationRequired: data.session === null, email }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error(configurationError)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error(configurationError)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error(configurationError)

    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error(configurationError)

    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user: session?.user ?? null, session, isLoading, initializationError, retryInitialization, signUp, signIn, requestPasswordReset, updatePassword, signOut }),
    [initializationError, isLoading, requestPasswordReset, retryInitialization, session, signIn, signOut, signUp, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
