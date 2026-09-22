import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import { OnboardingPage } from "@/pages/onboarding-page"
import { createBusinessValue, TestBusinessProvider } from "@/test/auth-test-utils"

function renderOnboarding(completeOnboarding = vi.fn()) {
  render(
    <TestBusinessProvider value={createBusinessValue({ completeOnboarding })}>
      <MemoryRouter><OnboardingPage /></MemoryRouter>
    </TestBusinessProvider>,
  )
  return completeOnboarding
}

async function reachBusinessStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /get started/i }))
}

async function reachModulesStep(user: ReturnType<typeof userEvent.setup>) {
  await reachBusinessStep(user)
  await user.type(screen.getByLabelText(/business name/i), "Northstar Market")
  await user.selectOptions(screen.getByLabelText(/^business type$/i), "Retail")
  await user.click(screen.getByRole("button", { name: /continue/i }))
}

describe("OnboardingPage", () => {
  it("validates the business name", async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await reachBusinessStep(user)
    await user.selectOptions(screen.getByLabelText(/^business type$/i), "Retail")
    await user.click(screen.getByRole("button", { name: /continue/i }))
    expect(screen.getByText("Enter your business name.")).toBeInTheDocument()
  })

  it("keeps Inventory selected and disabled", async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await reachModulesStep(user)
    const inventory = screen.getByRole("checkbox", { name: /inventory, always enabled/i })
    expect(inventory).toBeChecked()
    expect(inventory).toBeDisabled()
  })

  it("submits an Inventory-only setup", async () => {
    const user = userEvent.setup()
    const completeOnboarding = vi.fn().mockResolvedValue(undefined)
    renderOnboarding(completeOnboarding)
    await reachModulesStep(user)
    await user.click(screen.getByRole("button", { name: /review setup/i }))
    expect(screen.getByText(/starting with inventory only/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /finish setup/i }))
    expect(completeOnboarding).toHaveBeenCalledWith({ name: "Northstar Market", businessType: "Retail", enabledModules: [] })
  })

  it("submits the selected optional modules", async () => {
    const user = userEvent.setup()
    const completeOnboarding = vi.fn().mockResolvedValue(undefined)
    renderOnboarding(completeOnboarding)
    await reachModulesStep(user)
    await user.click(screen.getByRole("checkbox", { name: /sales/i }))
    await user.click(screen.getByRole("checkbox", { name: /analytics/i }))
    expect(screen.getByRole("checkbox", { name: /sales/i })).toHaveAttribute("aria-checked", "true")
    await user.click(screen.getByRole("button", { name: /review setup/i }))
    await user.click(screen.getByRole("button", { name: /finish setup/i }))
    expect(completeOnboarding).toHaveBeenCalledWith({ name: "Northstar Market", businessType: "Retail", enabledModules: ["sales", "analytics"] })
  })

  it("prevents double submission while creation is pending", async () => {
    const user = userEvent.setup()
    const completeOnboarding = vi.fn(() => new Promise<void>(() => undefined))
    renderOnboarding(completeOnboarding)
    await reachModulesStep(user)
    await user.click(screen.getByRole("button", { name: /review setup/i }))
    const finish = screen.getByRole("button", { name: /finish setup/i })
    await user.dblClick(finish)
    expect(completeOnboarding).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: /creating workspace/i })).toBeDisabled()
  })
})
