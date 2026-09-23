import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { useAuth } from "@/features/auth/auth-context"

export function ResetPasswordPage() {
  const { session, isLoading, initializationError, updatePassword, signOut } = useAuth()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({})
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdated, setIsUpdated] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    if (!password) nextErrors.password = "Create a password."
    else if (password.length < 8) nextErrors.password = "Password must be at least 8 characters."
    if (!confirmPassword) nextErrors.confirmPassword = "Confirm your password."
    else if (password !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match."
    setErrors(nextErrors)
    setFormError("")
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      await updatePassword(password)
      await signOut()
      setIsUpdated(true)
    } catch {
      setFormError("This reset link may have expired or is no longer valid. Request a new reset email and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <AuthCard description="Checking your password reset link." title="Reset your password"><div className="text-sm text-muted-foreground" role="status">Loading…</div></AuthCard>
  }

  if (isUpdated) {
    return <AuthCard description="Your password has been updated successfully." title="Password updated"><Button asChild className="h-11 w-full"><Link to="/login">Continue to sign in</Link></Button></AuthCard>
  }

  if (!session || initializationError) {
    return (
      <AuthCard description="This link may have expired or already been used." title="Reset link unavailable">
        <p className="text-sm leading-6 text-muted-foreground">Request a new password reset email to continue.</p>
        <Button asChild className="mt-6 h-11 w-full"><Link to="/forgot-password">Request a new reset link</Link></Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard description="Choose a new password for your StockPilot account." title="Create a new password">
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        {formError && <div aria-live="polite" className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive" role="alert">{formError}</div>}
        <FormField autoComplete="new-password" autoFocus disabled={isSubmitting} error={errors.password} id="password" label="New password" minLength={8} onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        <FormField autoComplete="new-password" disabled={isSubmitting} error={errors.confirmPassword} id="confirm-password" label="Confirm new password" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
        <Button className="h-11 w-full" disabled={isSubmitting} type="submit">{isSubmitting ? "Updating…" : "Update password"}</Button>
      </form>
    </AuthCard>
  )
}
