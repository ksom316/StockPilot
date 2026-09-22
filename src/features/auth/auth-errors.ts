export function getAuthErrorMessage(error: unknown, action: "signin" | "signup") {
  const fallback = action === "signin"
    ? "We couldn't sign you in. Please try again."
    : "We couldn't create your account. Please try again."

  if (!(error instanceof Error)) return fallback

  const message = error.message.toLowerCase()

  if (message.includes("invalid login credentials")) {
    return "The email or password is incorrect."
  }
  if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
    return "An account with this email already exists. Try signing in instead."
  }
  if (message.includes("password") && message.includes("weak")) {
    return "Choose a stronger password with at least 8 characters."
  }
  if (message.includes("authentication is not configured")) return error.message

  return fallback
}
