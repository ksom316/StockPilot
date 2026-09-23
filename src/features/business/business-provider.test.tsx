import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { User } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock("@/lib/supabase", () => ({ supabase: { from: supabaseMocks.from, rpc: supabaseMocks.rpc } }))

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

function ModuleUpdateProbe() {
  const { business, enabledModules, setModuleEnabled } = useBusiness()
  return <div><output>{business?.name ?? "loading"}:{enabledModules.join(",")}</output><button onClick={() => void setModuleEnabled("sales", true)} type="button">Enable Sales</button></div>
}

function OnboardingProbe() {
  const { business, completeOnboarding } = useBusiness()
  return <div><output>{business?.name ?? "no business"}</output><button onClick={() => void completeOnboarding({ name: "Northstar", businessType: "Retail", enabledModules: [], iconId: "store" }).catch((error: Error) => { document.title = error.message })} type="button">Complete onboarding</button></div>
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
  beforeEach(() => { supabaseMocks.from.mockReset(); supabaseMocks.rpc.mockReset(); document.title = "" })

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

  it("updates an existing module row for the current business and refreshes provider state", async () => {
    const user = userEvent.setup()
    let salesEnabled = false
    const updateEq = vi.fn()
    const moduleUpdate = vi.fn(({ enabled }: { enabled: boolean }) => {
      const builder = {
        eq: vi.fn((column: string, value: string) => { updateEq(column, value); return builder }),
        select: vi.fn(() => ({ maybeSingle: vi.fn(async () => { salesEnabled = enabled; return { data: { module: "sales", enabled }, error: null } }) })),
      }
      return builder
    })
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === "business_members") return makeBuilder({ data: [{ id: "membership-a", business_id: "business-a", role: "owner", status: "active", businesses: { id: "business-a", name: "Northstar", business_type: "Retail", currency: "USD" } }], error: null })
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: salesEnabled ? [{ module: "sales" }] : [], error: null })) })) })),
        update: moduleUpdate,
      }
    })

    render(<AuthContext.Provider value={authValue({ id: "user-a" } as User)}><BusinessProvider><ModuleUpdateProbe /></BusinessProvider></AuthContext.Provider>)
    expect(await screen.findByText("Northstar:")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /enable sales/i }))
    expect(await screen.findByText((_content, element) => element?.tagName === "OUTPUT" && element.textContent === "Northstar:sales")).toBeInTheDocument()
    expect(moduleUpdate).toHaveBeenCalledWith({ enabled: true })
    expect(updateEq).toHaveBeenCalledWith("business_id", "business-a")
    expect(updateEq).toHaveBeenCalledWith("module", "sales")
  })

  it("recovers an already-onboarded conflict by resolving the existing workspace", async () => {
    let membershipReads = 0
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === "business_members") {
        membershipReads += 1
        return makeBuilder(membershipReads === 1
          ? { data: [], error: null }
          : { data: [{ id: "membership-a", business_id: "business-a", role: "owner", status: "active", businesses: { id: "business-a", name: "Northstar", business_type: "Retail", currency: "USD" } }], error: null })
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [{ module: "sales" }], error: null })) })) })) }
    })
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "An active business membership already exists" } })

    render(<AuthContext.Provider value={authValue({ id: "user-a" } as User)}><BusinessProvider><OnboardingProbe /></BusinessProvider></AuthContext.Provider>)
    expect(await screen.findByText("no business")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /complete onboarding/i }))
    expect(await screen.findByText("Northstar")).toBeInTheDocument()
    expect(document.title).toBe("")
    expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("keeps a non-matching onboarding conflict as a safe error", async () => {
    supabaseMocks.from.mockImplementation((table: string) => table === "business_members"
      ? makeBuilder({ data: [], error: null })
      : { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })) })
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "Some other unique constraint failed" } })

    render(<AuthContext.Provider value={authValue({ id: "user-a" } as User)}><BusinessProvider><OnboardingProbe /></BusinessProvider></AuthContext.Provider>)
    await screen.findByText("no business")
    await userEvent.click(screen.getByRole("button", { name: /complete onboarding/i }))
    await vi.waitFor(() => expect(document.title).toBe("We couldn't finish your business setup. Please try again."))
    expect(supabaseMocks.from).toHaveBeenCalledTimes(1)
  })
})
