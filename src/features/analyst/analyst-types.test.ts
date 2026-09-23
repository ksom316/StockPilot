import { describe, expect, it } from "vitest"
import { analystErrorMessage } from "@/features/analyst/analyst-types"

describe("AI Analyst error messages", () => {
  it.each([
    ["ACCESS_DENIED", 403, /unavailable for this workspace or your role/i],
    ["RATE_LIMITED", 429, /request limits have been reached/i],
    ["PROVIDER_UNAVAILABLE", 503, /temporarily unavailable/i],
    ["PROVIDER_TIMEOUT", 504, /too long to respond/i],
  ] as const)("normalizes %s without leaking backend details", (code, status, expected) => {
    expect(analystErrorMessage(code, status)).toMatch(expected)
    expect(analystErrorMessage(code, status)).not.toMatch(/postgres|secret|internal/i)
  })
})
