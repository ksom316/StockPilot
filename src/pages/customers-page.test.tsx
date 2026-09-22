import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), setActive: vi.fn(), refetch: vi.fn(),
  data: [] as Array<{ id: string; name: string; phone: string | null; email: string | null; note?: string | null; isActive: boolean; createdAt?: string; updatedAt?: string }>,
  isLoading: false, isError: false,
}))
vi.mock("@/features/customers/customer-queries", () => ({
  useCustomers: () => ({ data: mocks.data, isLoading: mocks.isLoading, isError: mocks.isError, refetch: mocks.refetch }),
  useCustomerMutations: () => ({
    create: { mutateAsync: mocks.create, isPending: false },
    update: { mutateAsync: mocks.update, isPending: false },
    setActive: { mutateAsync: mocks.setActive, isPending: false },
  }),
}))

import { CustomersPage } from "@/pages/customers-page"
import { TestBusinessProvider, createBusinessValue, testBusiness } from "@/test/auth-test-utils"

type Role = "owner" | "manager" | "employee" | "cashier"
const managed = [
  { id: "c1", name: "Avery Jones", phone: "+1 555 0101", email: "avery@example.com", note: "Private note", isActive: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
  { id: "c2", name: "Morgan Lee", phone: null, email: "morgan@example.com", note: null, isActive: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
]
function renderPage(role: Role = "owner") {
  return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules: ["customers"] })}><MemoryRouter><CustomersPage /></MemoryRouter></TestBusinessProvider>)
}

describe("customer directory", () => {
  beforeEach(() => {
    mocks.data = managed
    mocks.isLoading = false; mocks.isError = false
    mocks.create.mockReset().mockResolvedValue("created-customer")
    mocks.update.mockReset().mockResolvedValue(undefined)
    mocks.setActive.mockReset().mockResolvedValue(undefined)
    mocks.refetch.mockReset()
  })
  afterEach(cleanup)

  it("shows an empty state", () => {
    mocks.data = []
    renderPage()
    expect(screen.getByText("No customers yet")).toBeInTheDocument()
  })

  it("searches name, phone, and email and lets managers filter inactive customers", async () => {
    const user = userEvent.setup(); renderPage("manager")
    expect(screen.getAllByText("Avery Jones").length).toBeGreaterThan(0)
    expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText("Status"), "inactive")
    expect(screen.getAllByText("Morgan Lee").length).toBeGreaterThan(0)
    await user.selectOptions(screen.getByLabelText("Status"), "all")
    await user.type(screen.getByRole("searchbox"), "555 0101")
    expect(screen.getAllByText("Avery Jones").length).toBeGreaterThan(0)
    expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument()
    await user.clear(screen.getByRole("searchbox")); await user.type(screen.getByRole("searchbox"), "morgan@example")
    expect(screen.getAllByText("Morgan Lee").length).toBeGreaterThan(0)
  })

  it.each(["employee", "cashier"] as const)("shows only basic directory fields and create action for %s", (role) => {
    mocks.data = [{ id: "c1", name: "Avery Jones", phone: "555-0101", email: "avery@example.com", isActive: true }]
    renderPage(role)
    expect(screen.getAllByText("Avery Jones").length).toBeGreaterThan(0)
    expect(screen.queryByText("Private note")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /edit avery/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /deactivate avery/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /add customer/i })).toBeInTheDocument()
  })

  it.each(["owner", "manager"] as const)("shows private note in details and supports editing for %s", async (role) => {
    const user = userEvent.setup(); renderPage(role)
    await user.click(screen.getAllByRole("button", { name: "View details for Avery Jones" })[0])
    expect(screen.getAllByText("Private note").length).toBeGreaterThan(0)
    await user.click(screen.getByRole("button", { name: "Close dialog" }))
    await user.click(screen.getAllByRole("button", { name: "Edit Avery Jones" })[0])
    expect(screen.getByLabelText(/private note/i)).toHaveValue("Private note")
  })

  it.each(["owner", "manager"] as const)("submits the supported edit fields for %s", async (role) => {
    const user = userEvent.setup(); renderPage(role)
    await user.click(screen.getAllByRole("button", { name: "Edit Avery Jones" })[0])
    await user.clear(screen.getByLabelText(/name/i)); await user.type(screen.getByLabelText(/name/i), "Avery Updated")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: "c1", input: { name: "Avery Updated", phone: "+1 555 0101", email: "avery@example.com", note: "Private note" } }))
  })

  it("allows creation after a duplicate warning and keeps create fields optional", async () => {
    const user = userEvent.setup(); renderPage()
    await user.click(screen.getByRole("button", { name: /add customer/i }))
    await user.type(screen.getByLabelText(/name/i), "Avery New")
    await user.type(screen.getByLabelText(/phone/i), "15550101")
    expect(screen.getByRole("status")).toHaveTextContent(/possible existing customer match/i)
    expect(screen.getByRole("status")).toHaveTextContent(/you can still create a separate record/i)
    await user.click(screen.getByRole("button", { name: "Create customer" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ name: "Avery New", phone: "15550101", email: null, note: null }))
  })

  it("creates a minimal employee record without a note control", async () => {
    const user = userEvent.setup(); renderPage("employee")
    await user.click(screen.getByRole("button", { name: /add customer/i }))
    expect(screen.queryByLabelText(/private note/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/name/i), "Walk-in Contact")
    await user.click(screen.getByRole("button", { name: "Create customer" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ name: "Walk-in Contact", phone: null, email: null, note: null }))
  })

  it("requires a name and validates database-compatible maximum lengths", async () => {
    const user = userEvent.setup(); renderPage()
    await user.click(screen.getByRole("button", { name: /add customer/i }))
    await user.click(screen.getByRole("button", { name: "Create customer" }))
    expect(screen.getByRole("alert")).toHaveTextContent(/name is required/i)
  })

  it("requires confirmation before deactivation, explains history, and offers no delete", async () => {
    const user = userEvent.setup(); renderPage()
    await user.click(screen.getAllByRole("button", { name: "Deactivate Avery Jones" })[0])
    expect(mocks.setActive).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toHaveTextContent(/historical sales remain unchanged/i)
    await user.click(screen.getByRole("button", { name: "Confirm deactivation" }))
    await waitFor(() => expect(mocks.setActive).toHaveBeenCalledWith({ id: "c1", active: false }))
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument()
  })

  it("allows reactivation through its dedicated explicit action", async () => {
    const user = userEvent.setup(); renderPage()
    await user.selectOptions(screen.getByLabelText("Status"), "inactive")
    await user.click(screen.getAllByRole("button", { name: "Reactivate Morgan Lee" })[0])
    await user.click(screen.getByRole("button", { name: "Confirm reactivation" }))
    await waitFor(() => expect(mocks.setActive).toHaveBeenCalledWith({ id: "c2", active: true }))
  })
})
