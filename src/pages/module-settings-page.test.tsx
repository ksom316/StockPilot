import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const moduleMocks = vi.hoisted(() => ({ useProducts: vi.fn() }))
vi.mock("@/features/inventory/inventory-queries", () => ({ useInventoryProducts: moduleMocks.useProducts }))

import { AppShell } from "@/components/layout/app-shell"
import { BusinessContext } from "@/features/business/business-context"
import { optionalModules } from "@/features/business/modules"
import { DashboardPage } from "@/pages/dashboard-page"
import { ModuleSettingsPage } from "@/pages/module-settings-page"
import { createAuthValue, createBusinessValue, testBusiness, testMembership, testSession, testUser, TestAuthProvider } from "@/test/auth-test-utils"

function SettingsFixture({ role = "owner", initial: initialModules = [], update = vi.fn().mockResolvedValue(undefined) }: { role?: "owner" | "manager" | "employee" | "cashier"; initial?: (typeof optionalModules)[number]["key"][]; update?: (module: (typeof optionalModules)[number]["key"], enabled: boolean) => Promise<void> }) {
  const [enabledModules, setEnabledModules] = useState(initialModules)
  const value = createBusinessValue({
    business: testBusiness,
    membership: { ...testMembership, role },
    role,
    enabledModules,
    onboardingRequired: false,
    setModuleEnabled: async (module, enabled) => {
      await update(module, enabled)
      setEnabledModules((current) => enabled ? [...new Set([...current, module])] : current.filter((item) => item !== module))
    },
  })
  return <BusinessContext.Provider value={value}><ModuleSettingsPage /></BusinessContext.Provider>
}

function renderSettings(props: Parameters<typeof SettingsFixture>[0] = {}) {
  return render(<SettingsFixture {...props} />)
}

describe("ModuleSettingsPage", () => {
  it("keeps core Inventory always enabled without a disable control and lists every optional module", () => {
    renderSettings()
    const core = screen.getByRole("region", { name: /core/i })
    expect(within(core).getByText("Inventory")).toBeInTheDocument()
    expect(within(core).getByText(/always enabled/i)).toBeInTheDocument()
    expect(within(core).queryByRole("switch")).not.toBeInTheDocument()
    const optional = screen.getByRole("region", { name: /optional modules/i })
    for (const module of optionalModules) {
      expect(within(optional).getByRole("switch", { name: `${module.label} module` })).toHaveAttribute("aria-checked", "false")
      expect(within(optional).getByText(module.description)).toBeInTheDocument()
      expect(within(optional).getAllByText("Disabled · Coming soon")).toHaveLength(7)
    }
    expect(within(optional).getAllByRole("switch")).toHaveLength(7)
  })

  it("lets the owner enable and disable an optional module", async () => {
    const user = userEvent.setup()
    const update = vi.fn().mockResolvedValue(undefined)
    renderSettings({ update })
    const sales = screen.getByRole("switch", { name: "Sales module" })
    await user.click(sales)
    expect(update).toHaveBeenLastCalledWith("sales", true)
    expect(screen.getByRole("switch", { name: "Sales module" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getAllByText("Enabled · Coming soon")).toHaveLength(1)
    await user.click(screen.getByRole("switch", { name: "Sales module" }))
    expect(update).toHaveBeenLastCalledWith("sales", false)
    expect(screen.getByRole("switch", { name: "Sales module" })).toHaveAttribute("aria-checked", "false")
  })

  it.each(["manager", "employee", "cashier"] as const)("keeps %s module settings read-only", (role) => {
    renderSettings({ role, initial: ["sales"] })
    const optional = screen.getByRole("region", { name: /optional modules/i })
    expect(within(optional).queryByRole("switch")).not.toBeInTheDocument()
    expect(within(optional).getByText("Only the business owner can change module settings.")).toBeInTheDocument()
    expect(within(optional).getByText("Sales")).toBeInTheDocument()
  })

  it("shows a friendly error and keeps the confirmed module state after failure", async () => {
    const user = userEvent.setup()
    renderSettings({ update: vi.fn().mockRejectedValue(new Error("We couldn't update this module. Please try again.")) })
    await user.click(screen.getByRole("switch", { name: "Sales module" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't update this module/i)
    expect(screen.getByRole("switch", { name: "Sales module" })).toHaveAttribute("aria-checked", "false")
    expect(screen.queryByText(/postgres|permission denied/i)).not.toBeInTheDocument()
  })

  it("prevents repeated updates while a change is pending", async () => {
    const user = userEvent.setup()
    let finishUpdate: (() => void) | undefined
    const update = vi.fn(() => new Promise<void>((resolve) => { finishUpdate = resolve }))
    renderSettings({ update })
    await user.click(screen.getByRole("switch", { name: "Sales module" }))
    expect(screen.getByRole("switch", { name: /sales module/i })).toBeDisabled()
    expect(screen.getAllByRole("switch").every((button) => button.hasAttribute("disabled"))).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
    await act(async () => finishUpdate?.())
    expect(screen.getByRole("switch", { name: "Sales module" })).toHaveAttribute("aria-checked", "true")
  })
})

function ModuleRoutingFixture() {
  const [enabledModules, setEnabledModules] = useState<(typeof optionalModules)[number]["key"][]>([])
  const businessValue = createBusinessValue({
    business: testBusiness,
    membership: testMembership,
    role: "owner",
    enabledModules,
    onboardingRequired: false,
    setModuleEnabled: async (module, enabled) => setEnabledModules((current) => enabled ? [...new Set([...current, module])] : current.filter((item) => item !== module)),
  })
  return <TestAuthProvider value={createAuthValue({ user: testUser, session: testSession })}><BusinessContext.Provider value={businessValue}><MemoryRouter initialEntries={["/settings/modules"]}><Routes><Route element={<AppShell />}><Route element={<ModuleSettingsPage />} path="/settings/modules" /><Route element={<DashboardPage />} path="/dashboard" /></Route></Routes></MemoryRouter></BusinessContext.Provider></TestAuthProvider>
}

describe("module state integration", () => {
  it("updates navigation and dashboard after enabling, then removes a disabled module", async () => {
    moduleMocks.useProducts.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() })
    const user = userEvent.setup()
    render(<ModuleRoutingFixture />)
    await user.click(screen.getByRole("switch", { name: "Sales module" }))
    const navigation = screen.getByRole("navigation", { name: /workspace navigation/i })
    expect(within(navigation).getByText("Sales")).toBeInTheDocument()
    expect(within(navigation).getByRole("link", { name: "Sales" })).toHaveAttribute("href", "/sales")
    await user.click(screen.getByRole("link", { name: "Dashboard" }))
    expect(screen.getByRole("list")).toHaveTextContent("Sales")
    await user.click(screen.getByRole("link", { name: "Modules" }))
    await user.click(screen.getByRole("switch", { name: "Sales module" }))
    expect(within(screen.getByRole("navigation", { name: /workspace navigation/i })).queryByText("Sales")).not.toBeInTheDocument()
    expect(within(screen.getByRole("navigation", { name: /workspace navigation/i })).getByRole("link", { name: "Inventory" })).toBeInTheDocument()
    await user.click(screen.getByRole("link", { name: "Dashboard" }))
    expect(screen.getByRole("list")).not.toHaveTextContent("Sales")
  })
})
