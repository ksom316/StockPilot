import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TestBusinessProvider, createBusinessValue, testBusiness } from "@/test/auth-test-utils"

const mocks = vi.hoisted(() => ({ getAdvice: vi.fn(), useSnapshot: vi.fn() }))
vi.mock("@/features/opportunities/opportunity-service", () => ({ getOpportunityAdvice: mocks.getAdvice }))
vi.mock("@/features/opportunities/opportunity-queries", () => ({ useOpportunitySnapshot: mocks.useSnapshot }))
import { OpportunitiesPage } from "./opportunities-page"

const signal = { signalId: "RESTOCK_DEMAND:20000000-0000-4000-8000-000000000001", type: "RESTOCK_DEMAND" as const, priority: "HIGH" as const, title: "Review replenishment", summary: "Recorded demand is present.", product: { id: "p1", name: "Item", sku: "SKU-1" }, observationPeriod: { startDate: "2026-08-01", endDate: "2026-08-30", completedBusinessDates: 30 }, comparisonPeriod: null, evidence: { recordedSalesQuantity: "6.000" }, limitations: ["Not a prediction."] }
const data = { schemaVersion: 1 as const, module: "smart_insights" as const, disclaimer: "Recorded data only.", periods: { observation: signal.observationPeriod, comparison: signal.observationPeriod }, modules: {}, selection: { totalSignals: 1, returnedSignals: 1, truncated: false }, signals: [signal] }
function renderPage(role: "owner" | "manager" | "employee" | "cashier" = "owner") { return render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, role, enabledModules: ["smart_insights"] })}><OpportunitiesPage /></TestBusinessProvider>) }

describe("OpportunitiesPage", () => {
  beforeEach(() => { mocks.getAdvice.mockReset(); mocks.useSnapshot.mockReturnValue({ data, isLoading: false, isError: false, refetch: vi.fn() }) })
  it("renders deterministic signals and does not call AI on load", () => { renderPage(); expect(screen.getByRole("heading", { name: "Business Opportunities" })).toBeInTheDocument(); expect(screen.getByText("HIGH priority")).toBeInTheDocument(); expect(screen.getByText("6.000")).toBeInTheDocument(); expect(mocks.getAdvice).not.toHaveBeenCalled() })
  it("calls AI only after explicit guidance and prevents duplicate submission", async () => { const user = userEvent.setup(); mocks.getAdvice.mockImplementation(() => new Promise(() => undefined)); renderPage(); await user.click(screen.getByRole("button", { name: "Get AI Guidance" })); expect(mocks.getAdvice).toHaveBeenCalledWith({ businessId: "business-1" }); expect(screen.getByRole("button", { name: /preparing guidance/i })).toBeDisabled(); await user.click(screen.getByRole("button", { name: /preparing guidance/i })); expect(mocks.getAdvice).toHaveBeenCalledTimes(1) })
  it("shows an empty state and disables AI guidance without deterministic opportunities", async () => { const user = userEvent.setup(); mocks.useSnapshot.mockReturnValue({ data: { ...data, signals: [], selection: { ...data.selection, totalSignals: 0, returnedSignals: 0 } }, isLoading: false, isError: false, refetch: vi.fn() }); renderPage(); expect(screen.getByText(/no eligible opportunities/i)).toBeInTheDocument(); expect(screen.getByText(/ai guidance becomes available when stockpilot identifies at least one deterministic opportunity/i)).toBeInTheDocument(); const button = screen.getByRole("button", { name: "Get AI Guidance" }); expect(button).toBeDisabled(); await user.click(button); expect(mocks.getAdvice).not.toHaveBeenCalled() })
  it.each(["employee", "cashier"] as const)("does not render for %s", (role) => { renderPage(role); expect(screen.queryByRole("heading", { name: "Business Opportunities" })).not.toBeInTheDocument() })
  it("does not render when Smart Insights is disabled", () => { render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, role: "owner", enabledModules: [] })}><OpportunitiesPage /></TestBusinessProvider>); expect(screen.queryByRole("heading", { name: "Business Opportunities" })).not.toBeInTheDocument() })
})
