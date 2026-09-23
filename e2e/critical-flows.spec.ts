import { expect, test, type Page } from "@playwright/test"

const email = process.env.STOCKPILOT_E2E_EMAIL ?? ""
const password = process.env.STOCKPILOT_E2E_PASSWORD ?? ""
const runId = Date.now().toString()
const productName = `E2E Product ${runId}`
const businessName = `E2E Business ${runId}`
const secondBusinessName = `E2E Second Business ${runId}`

async function signIn(page: Page) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/)
}

async function completeOnboarding(page: Page) {
  const start = page.getByRole("button", { name: "Get started" })
  if (!await expect(start).toBeVisible({ timeout: 5_000 }).then(() => true).catch(() => false)) return
  await start.click()
  await page.getByLabel("Business name").fill(businessName)
  await page.getByLabel("Business type").selectOption({ label: "Retail" })
  await page.getByRole("button", { name: "Continue" }).click()
  await page.getByRole("checkbox", { name: /^Sales/ }).click()
  await page.getByRole("checkbox", { name: /^Purchasing/ }).click()
  await page.getByRole("checkbox", { name: /^Analytics/ }).click()
  await page.getByRole("button", { name: "Review setup" }).click()
  await page.getByRole("button", { name: "Finish setup" }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

async function selectProduct(page: Page) {
  const select = page.locator("select").filter({ hasText: "Choose a product" }).first()
  const option = select.locator("option").filter({ hasText: productName }).first()
  const value = await option.getAttribute("value")
  if (!value) throw new Error(`Could not find the E2E product option: ${productName}`)
  await select.selectOption(value)
}

test.describe.serial("critical local workspace flows", () => {
  test.setTimeout(60_000)

  test("authenticates, completes first workspace setup, and remains usable on mobile", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login/)
    await signIn(page)
    await completeOnboarding(page)
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible()
    await page.getByRole("button", { name: "Open navigation menu" }).click()
    await expect(page.getByRole("dialog", { name: "Mobile navigation" })).toBeVisible()
  })

  test("creates a SKU-optional product, adjusts stock, and records sales and purchasing", async ({ page }) => {
    await signIn(page)
    await completeOnboarding(page)

    await page.goto("/inventory")
    await page.getByRole("button", { name: "Add product" }).first().click()
    await page.getByLabel("Product name").fill(productName)
    await page.getByLabel("Cost price").fill("4")
    await page.getByLabel("Selling price").fill("10")
    await page.getByRole("button", { name: "Add product" }).last().click()
    await expect(page.getByText(productName, { exact: true }).first()).toBeVisible()
    await expect(page.getByText("No SKU", { exact: true }).first()).toBeVisible()

    await page.getByRole("button", { name: `Manage stock for ${productName}` }).click()
    await page.getByLabel("Quantity").fill("10")
    await page.getByRole("button", { name: "Record operation" }).click()
    await expect(page.getByRole("status")).toContainText("updated")

    await page.goto("/sales")
    await selectProduct(page)
    await page.getByLabel("Quantity").fill("2")
    await page.getByLabel("Unit price").fill("10")
    await page.getByRole("button", { name: "Add to sale" }).click()
    await page.getByRole("button", { name: "Record sale" }).click()
    await expect(page.getByRole("status")).toContainText("Sale recorded")

    await page.goto("/purchasing")
    await selectProduct(page)
    await page.getByLabel("Quantity received").fill("5")
    await page.getByLabel("Unit cost").fill("4")
    await page.getByRole("button", { name: "Add to receipt" }).click()
    await page.getByRole("button", { name: "Record receipt" }).click()
    await expect(page.getByRole("status")).toContainText("Receipt recorded")
  })

  test("keeps invalid date input in a recoverable user-facing state", async ({ page }) => {
    await signIn(page)
    await completeOnboarding(page)
    await page.goto("/analytics")
    await page.getByLabel("Analytics period", { exact: true }).selectOption("custom")
    await page.getByLabel("Analytics start date", { exact: true }).fill("2099-01-02")
    await page.getByLabel("Analytics end date", { exact: true }).fill("2099-01-01")
    await expect(page.getByRole("status")).toContainText("Choose valid")
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible()
  })

  test("keeps currency and module boundaries business-scoped", async ({ page }) => {
    await signIn(page)
    await completeOnboarding(page)
    await page.goto("/settings/modules")
    await expect(page.locator("#business-currency")).toBeDisabled()
    await expect(page.getByText("Currency cannot be changed after financial activity has been recorded.")).toBeVisible()

    await page.goto("/analyst")
    await expect(page).toHaveURL(/\/dashboard/)

    const workspaceButton = page.getByRole("button", { name: /^Current workspace:/ })
    const primaryBusinessName = (await workspaceButton.getAttribute("aria-label"))?.replace("Current workspace: ", "")
    if (!primaryBusinessName) throw new Error("Could not identify the primary E2E workspace")
    await workspaceButton.click()
    await page.getByRole("menuitem", { name: /Create business/ }).click()
    await page.getByLabel("Business name").fill(secondBusinessName)
    await page.getByLabel("Business type").selectOption({ label: "Retail" })
    await page.getByRole("button", { name: "Create business" }).click()
    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto("/inventory")
    await expect(page.getByText(productName, { exact: true })).not.toBeVisible()
    await page.getByRole("button", { name: /^Current workspace:/ }).click()
    await page.getByRole("menuitemradio", { name: new RegExp(primaryBusinessName) }).click()
    await expect(page.getByRole("button", { name: `Current workspace: ${primaryBusinessName}` })).toBeVisible()
    await page.goto("/inventory")
    await expect(page.getByText(/^E2E Product /).first()).toBeVisible()
    await expect(page.getByText(productName, { exact: true }).first()).toBeVisible()
  })
})
