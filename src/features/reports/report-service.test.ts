import { beforeEach, describe, expect, it, vi } from "vitest"
const rpc = vi.hoisted(() => vi.fn())
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }))
import { fetchReport, parseReport } from "./report-service"

const response = { schemaVersion: 1, businessId: "b1", reportType: "sales", startDate: "2026-09-01", endDate: "2026-09-23", timezone: "UTC", page: 1, pageSize: 50, totalRows: 1, summary: { recordedSales: "9007199254740993.1234" }, rows: [{ reference: "SALE-000001", recordedTotal: "9007199254740993.1234" }] }
describe("report service", () => {
  beforeEach(() => rpc.mockReset())
  it("preserves exact numeric strings and validates scope", async () => { rpc.mockResolvedValue({ data: response, error: null }); await expect(fetchReport("b1", "sales", "2026-09-01", "2026-09-23")).resolves.toMatchObject({ summary: response.summary, rows: response.rows }); expect(rpc).toHaveBeenCalledWith("get_report", expect.objectContaining({ p_report_type: "sales", p_page_size: 50 })) })
  it("rejects malformed contracts", () => { expect(() => parseReport({ ...response, rows: [{ bad: {} }] })).not.toThrow(); expect(() => parseReport({ ...response, schemaVersion: 2 })).toThrow(/invalid/i) })
})
