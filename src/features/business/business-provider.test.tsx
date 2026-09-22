import { act, render, screen } from "@testing-library/react"
import type { User } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/supabase", () => ({ supabase: { from: supabaseMocks.from, rpc: vi.fn() } }))

import { AuthContext, type AuthContextValue } from "@/features/auth/auth-context"
import { BusinessProvider } from "@/features/business/business-provider"
import { useBusiness } from "@/features/business/business-context"

function authValue(user: User): AuthContextValue {
  return { user, session: null, isLoading: false, initializationError: null, retryInitialization: vi.fn(), signUp: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }
}

function Probe() {
  const { business, isLoading, enabledModules } = useBusiness()
  return <div>{isLoading ? "workspace loading" : `${business?.name ?? "no business"}:${enabledModules.join(",")}`}</div>
}

function makeBuilder(response: Promise<unknown> | unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(response)),
  }
  return builder
}

describe("BusinessProvider identity boundaries", () => {
  beforeEach(() => supabaseMocks.from.mockReset())

  it("hides the previous workspace immediately when the authenticated user changes", async () => {
    let releaseUserB: ((value: unknown) => void) | undefined
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === "business_members") {
        if (supabaseMocks.from.mock.calls.filter(([name]) => name === table).length === 1) {
          return makeBuilder({ data: [{ id: "membership-a", business_id: "business-a", role: "owner", status: "active", businesses: { id: "business-a", name: "Private Company A", business_type: "Retail", currency: "USD" } }], error: null })
        }
        return makeBuilder(new Promise((resolve) => { releaseUserB = resolve }))
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [{ module: "sales" }], error: null })) })) })) }
    })

    const { rerender } = render(
      <AuthContext.Provider value={authValue({ id: "user-a" } as User)}>
        <BusinessProvider><Probe /></BusinessProvider>
      </AuthContext.Provider>,
    )
    expect(await screen.findByText("Private Company A:sales")).toBeInTheDocument()

    rerender(
      <AuthContext.Provider value={authValue({ id: "user-b" } as User)}>
        <BusinessProvider><Probe /></BusinessProvider>
      </AuthContext.Provider>,
    )
    expect(screen.getByText("workspace loading")).toBeInTheDocument()
    expect(screen.queryByText(/Private Company A/)).not.toBeInTheDocument()

    await act(async () => {
      releaseUserB?.({ data: [], error: null })
    })
    expect(await screen.findByText("no business:")).toBeInTheDocument()
  })
})
