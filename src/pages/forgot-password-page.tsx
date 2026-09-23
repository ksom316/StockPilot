import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"

import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { useAuth } from "@/features/auth/auth-context"

const genericSuccessMessage = "If an account exists for this email, we've sent password reset instructions."

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    setEmailError(trimmedEmail ? (/^\S+@\S+\.\S+$/.test(trimmedEmail) ? "" : "Enter a valid email address.") : "Enter your email address.")
    setFormError("")
    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) return

    setIsSubmitting(true)
    try {
      await requestPasswordReset(trimmedEmail)
      setIsSubmitted(true)
    } catch {
      setFormError("We couldn't send reset instructions right now. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthCard
      description="Enter your email and we'll help you get back into your workspace."
      footer={<>Remember your password? <Link className="font-medium text-primary hover:underline" to="/login">Sign in</Link></>}
      title="Reset your password"
    >
      {isSubmitted ? (
        <div aria-live="polite" className="space-y-5">
          <p className="rounded-md border border-primary/25 bg-primary/5 px-3 py-3 text-sm leading-6 text-foreground">{genericSuccessMessage}</p>
          <Button asChild className="h-11 w-full" variant="outline"><Link to="/login">Return to sign in</Link></Button>
        </div>
      ) : (
        <form className="space-y-5" noValidate onSubmit={handleSubmit}>
          {formError && <div aria-live="polite" className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive" role="alert">{formError}</div>}
          <FormField autoComplete="email" autoFocus disabled={isSubmitting} error={emailError} id="email" inputMode="email" label="Email" onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" type="email" value={email} />
          <Button className="h-11 w-full" disabled={isSubmitting} type="submit">{isSubmitting ? "Sending…" : "Send reset instructions"}</Button>
        </form>
      )}
    </AuthCard>
  )
}

export { genericSuccessMessage }
