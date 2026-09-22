import { act, render, screen, waitFor } from "@testing-library/react"
import type { Session } from "@supabase/supabase-js"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({
  callback: undefined as ((event: string, session: Session | null) => void) | undefined,
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: (callback: typeof authMocks.callback) => {
        authMocks.callback = callback
        return { data: { subscription: { unsubscribe: authMocks.unsubscribe } } }
      },
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

import { AuthProvider } from "@/features/auth/auth-provider"
import { useAuth } from "@/features/auth/auth-context"

function AuthState() {
  const { user, isLoading, initializationError } = useAuth()
  return <div>{isLoading ? "loading" : initializationError ?? user?.id ?? "signed out"}</div>
}

function Wrapper({ children }: PropsWithChildren) {
  return <AuthProvider>{children}</AuthProvider>
}

describe("AuthProvider session initialization", () => {
  beforeEach(() => {
    authMocks.getSession.mockReset()
    authMocks.unsubscribe.mockReset()
    authMocks.callback = undefined
  })

  it("does not let a late initial session response overwrite a newer auth event", async () => {
    let resolveInitialSession: ((value: { data: { session: Session | null }; error: null }) => void) | undefined
    authMocks.getSession.mockReturnValue(new Promise((resolve) => { resolveInitialSession = resolve }))
    render(<Wrapper><AuthState /></Wrapper>)

    const activeSession = { user: { id: "new-session-user" } } as Session
    act(() => authMocks.callback?.("SIGNED_IN", activeSession))
    expect(screen.getByText("new-session-user")).toBeInTheDocument()

    await act(async () => {
      resolveInitialSession?.({ data: { session: null }, error: null })
    })

    expect(screen.getByText("new-session-user")).toBeInTheDocument()
  })

  it("shows a recoverable error when restoring the session rejects", async () => {
    authMocks.getSession.mockRejectedValue(new Error("session storage unavailable"))
    render(<Wrapper><AuthState /></Wrapper>)

    await waitFor(() => expect(screen.getByText(/couldn't restore your session/i)).toBeInTheDocument())
  })
})
