export type ErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "ACCESS_DENIED"
  | "MODULE_DISABLED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "INVALID_PROVIDER_RESPONSE"
  | "AI_NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"

export class AnalystError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "AnalystError"
  }
}

export function asAnalystError(error: unknown): AnalystError {
  return error instanceof AnalystError
    ? error
    : new AnalystError(500, "INTERNAL_ERROR", "The analysis could not be completed.")
}
