import { MailCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"

import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { getAuthErrorMessage } from "@/features/auth/auth-errors"
import { useAuth } from "@/features/auth/auth-context"

interface SignupErrors {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [errors, setErrors] = useState<SignupErrors>({})
  const [formError, setFormError] = useState("")
  const [confirmationEmail, setConfirmationEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = () => {
    const nextErrors: SignupErrors = {}
    const trimmedName = fullName.trim()
    if (!trimmedName) nextErrors.fullName = "Enter your full name."
    else if (trimmedName.length > 120) nextErrors.fullName = "Full name must be 120 characters or fewer."
    if (!email.trim()) nextErrors.email = "Enter your email address."
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address."
    if (!password) nextErrors.password = "Create a password."
    else if (password.length < 8) nextErrors.password = "Password must be at least 8 characters."
    if (!confirmPassword) nextErrors.confirmPassword = "Confirm your password."
    else if (password !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match."
    return nextErrors
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    setFormError("")
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const result = await signUp(fullName.trim(), email.trim(), password)
      if (result.confirmationRequired) setConfirmationEmail(result.email)
      else navigate("/dashboard", { replace: true })
    } catch (error) {
      setFormError(getAuthErrorMessage(error, "signup"))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (confirmationEmail) {
    return (
      <AuthCard description="Confirm your email to finish creating your StockPilot account." title="Check your email">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck aria-hidden="true" className="size-6" />
          </span>
          <p className="mt-5 leading-6 text-muted-foreground">
            We sent a confirmation link to <strong className="font-medium text-foreground">{confirmationEmail}</strong>.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">Open the link in that email, then return to sign in.</p>
          <Button asChild className="mt-6 w-full" variant="outline">
            <Link to="/login">Return to sign in</Link>
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      description="Create your account. Your business setup comes next."
      footer={<>Already have an account? <Link className="font-medium text-primary hover:underline" to="/login">Sign in</Link></>}
      title="Create your account"
    >
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        {formError && <div aria-live="polite" className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive" role="alert">{formError}</div>}
        <FormField autoComplete="name" autoFocus disabled={isSubmitting} error={errors.fullName} id="full-name" label="Full name" onChange={(event) => setFullName(event.target.value)} placeholder="Alex Morgan" value={fullName} />
        <FormField autoComplete="email" disabled={isSubmitting} error={errors.email} id="email" inputMode="email" label="Email" onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" type="email" value={email} />
        <FormField autoComplete="new-password" disabled={isSubmitting} error={errors.password} id="password" label="Password" minLength={8} onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        <FormField autoComplete="new-password" disabled={isSubmitting} error={errors.confirmPassword} id="confirm-password" label="Confirm password" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
        <Button className="h-11 w-full" disabled={isSubmitting} type="submit">{isSubmitting ? "Creating account…" : "Create account"}</Button>
      </form>
    </AuthCard>
  )
}
