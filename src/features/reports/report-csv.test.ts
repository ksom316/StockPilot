import { describe, expect, it } from "vitest"
import { csvCell, toCsv } from "./report-csv"

describe("report CSV export", () => {
  it("escapes delimiters and protects textual formula prefixes without changing numeric values", () => {
    expect(csvCell("=SUM(A1:A2)", true)).toBe("'=SUM(A1:A2)")
    expect(csvCell("A, \"quoted\"", true)).toBe('"A, ""quoted"""')
    expect(csvCell("-12.3400", false)).toBe("-12.3400")
    expect(toCsv([{ key: "name", label: "Product", text: true }, { key: "amount", label: "Amount" }], [{ name: "=danger", amount: "9007199254740993.1234" }])).toContain("'=danger,9007199254740993.1234")
  })
})
