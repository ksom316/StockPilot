import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { getAuthErrorMessage } from "@/features/auth/auth-errors"
import { useAuth } from "@/features/auth/auth-context"

interface LoginErrors {
  email?: string
  password?: string
}

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<LoginErrors>({})
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = () => {
    const nextErrors: LoginErrors = {}
    if (!email.trim()) nextErrors.email = "Enter your email address."
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address."
    if (!password) nextErrors.password = "Enter your password."
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
      await signIn(email.trim(), password)
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      navigate(destination ?? "/dashboard", { replace: true })
    } catch (error) {
      setFormError(getAuthErrorMessage(error, "signin"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthCard
      description="Welcome back. Sign in to continue to your workspace."
      footer={<>New to StockPilot? <Link className="font-medium text-primary hover:underline" to="/signup">Create an account</Link></>}
      title="Sign in to StockPilot"
    >
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        {formError && <div aria-live="polite" className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive" role="alert">{formError}</div>}
        <FormField
          autoComplete="email"
          autoFocus
          disabled={isSubmitting}
          error={errors.email}
          id="email"
          inputMode="email"
          label="Email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          type="email"
          value={email}
        />
        <FormField
          autoComplete="current-password"
          disabled={isSubmitting}
          error={errors.password}
          id="password"
          label="Password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <div className="-mt-2 text-right text-sm">
          <Link className="font-medium text-primary hover:underline" to="/forgot-password">Forgot password?</Link>
        </div>
        <Button className="h-11 w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  )
}
