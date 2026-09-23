import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { TestBusinessProvider, createBusinessValue, testBusiness } from "@/test/auth-test-utils"
import { ReportsPage } from "./reports-page"

const report = { data: { reportType: "inventory", startDate: "2026-09-01", endDate: "2026-09-23", page: 1, pageSize: 50, totalRows: 1, summary: { activeProducts: 1 }, rows: [{ product: "Coffee", currentQuantity: "4.000" }] }, isLoading: false, isError: false, refetch: vi.fn() }
vi.mock("@/features/reports/report-queries", () => ({ useReport: () => report }))

describe("ReportsPage", () => {
  it("shows only reports for enabled modules and renders data", () => {
    render(<TestBusinessProvider value={createBusinessValue({ business: testBusiness, role: "manager", enabledModules: ["sales"] })}><MemoryRouter><ReportsPage /></MemoryRouter></TestBusinessProvider>)
    expect(screen.getByRole("option", { name: "Inventory Report" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Sales Report" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Purchasing Report" })).not.toBeInTheDocument()
    expect(screen.getByText("Coffee")).toBeInTheDocument()
  })
})
