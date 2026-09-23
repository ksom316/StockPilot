import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalystPage } from "@/pages/analyst-page"
import { createBusinessValue, testBusiness, TestBusinessProvider } from "@/test/auth-test-utils"

const mocks = vi.hoisted(() => ({ askAnalyst: vi.fn() }))
vi.mock("@/features/analyst/analyst-service", () => ({ askAnalyst: mocks.askAnalyst }))

const answer = {
  requestId: "request-1",
  answer: "Recorded Sales were US$100.2500.",
  evidence: [{ id: "sales.recorded_sales", label: "Recorded Sales", value: "USD 100.2500", period: "THIS_MONTH" }],
  limitations: ["Estimated figures remain estimates."],
  suggestedQuestions: ["How did Recorded Sales perform in this period?"],
}

function renderPage(enabledModules: Array<"sales" | "purchasing" | "expenses" | "smart_insights"> = ["sales", "expenses"]) {
  return render(<MemoryRouter><TestBusinessProvider value={createBusinessValue({ business: testBusiness, role: "owner", enabledModules })}><AnalystPage /></TestBusinessProvider></MemoryRouter>)
}

describe("AnalystPage", () => {
  beforeEach(() => mocks.askAnalyst.mockReset())

  it("shows the initial state and starter questions only for enabled modules", () => {
    renderPage(["sales"])
    expect(screen.getByRole("heading", { name: /ask about your business/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /how did recorded sales/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /purchase receipts/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /profitability/i })).not.toBeInTheDocument()
  })

  it("sends the exact Phase 10B payload and renders answer, evidence, and limitations", async () => {
    const user = userEvent.setup()
    mocks.askAnalyst.mockResolvedValue(answer)
    renderPage()
    await user.selectOptions(screen.getByRole("combobox", { name: "Analysis period" }), "TODAY")
    await user.type(screen.getByRole("textbox", { name: "Question" }), "What happened?")
    await user.click(screen.getByRole("button", { name: "Ask Analyst" }))
    expect(mocks.askAnalyst).toHaveBeenCalledWith({ businessId: testBusiness.id, period: "TODAY", question: "What happened?" })
    expect(await screen.findByRole("heading", { name: "Answer" })).toBeInTheDocument()
    expect(screen.getByText(answer.answer)).toBeInTheDocument()
    expect(screen.getByText("Recorded Sales")).toBeInTheDocument()
    expect(screen.getByText("USD 100.2500")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Limitations" })).toBeInTheDocument()
    expect(screen.getByText(answer.limitations[0])).toBeInTheDocument()
  })

  it("sends exact business-local custom dates", async () => {
    const user = userEvent.setup()
    mocks.askAnalyst.mockResolvedValue(answer)
    renderPage()
    await user.selectOptions(screen.getByRole("combobox", { name: "Analysis period" }), "CUSTOM")
    fireEvent.change(screen.getByLabelText("Analysis start date"), { target: { value: "2026-09-01" } })
    fireEvent.change(screen.getByLabelText("Analysis end date"), { target: { value: "2026-09-15" } })
    await user.type(screen.getByRole("textbox", { name: "Question" }), "What changed?")
    await user.click(screen.getByRole("button", { name: "Ask Analyst" }))
    expect(mocks.askAnalyst).toHaveBeenCalledWith({ businessId: testBusiness.id, period: "CUSTOM", question: "What changed?", startDate: "2026-09-01", endDate: "2026-09-15" })
  })

  it("rejects reversed custom dates without requesting Analyst", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(screen.getByRole("combobox", { name: "Analysis period" }), "CUSTOM")
    fireEvent.change(screen.getByLabelText("Analysis start date"), { target: { value: "2026-09-20" } })
    fireEvent.change(screen.getByLabelText("Analysis end date"), { target: { value: "2026-09-01" } })
    await user.type(screen.getByRole("textbox", { name: "Question" }), "What changed?")
    await user.click(screen.getByRole("button", { name: "Ask Analyst" }))
    expect(mocks.askAnalyst).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(/valid business-local custom range/i)
  })

  it("does not request when the question is empty or over 800 characters", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole("button", { name: "Ask Analyst" }))
    expect(mocks.askAnalyst).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole("textbox", { name: "Question" }), { target: { value: "a".repeat(801) } })
    await user.click(screen.getByRole("button", { name: "Ask Analyst" }))
    expect(mocks.askAnalyst).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(/1 and 800 characters/i)
  })

  it("shows the loading state while a request is pending", async () => {
    const user = userEvent.setup()
    let finish: (() => void) | undefined
    mocks.askAnalyst.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    renderPage()
    await user.type(screen.getByRole("textbox", { name: "Question" }), "How were sales?")
    await user.click(screen.getByRole("button", { name: /ask analyst/i }))
    expect(screen.getByRole("status")).toHaveTextContent(/preparing a grounded answer/i)
    expect(screen.getByRole("button", { name: /analyzing/i })).toBeDisabled()
    await act(async () => finish?.())
  })

})
