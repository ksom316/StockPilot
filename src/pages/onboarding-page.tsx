import { Check, ChevronLeft, ChevronRight, PackageCheck, Sparkles } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { useBusiness } from "@/features/business/business-context"
import { getModuleLabel, optionalModules, type OptionalModule } from "@/features/business/modules"

const steps = ["Welcome", "Business", "Modules", "Review"]
const businessTypes = ["Retail", "Electronics", "Fashion", "Cosmetics", "Grocery / Mini-mart", "Pharmacy", "Other"]

export function OnboardingPage() {
  const { completeOnboarding } = useBusiness()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [businessName, setBusinessName] = useState("")
  const [businessTypeChoice, setBusinessTypeChoice] = useState("")
  const [customBusinessType, setCustomBusinessType] = useState("")
  const [selectedModules, setSelectedModules] = useState<OptionalModule[]>([])
  const [errors, setErrors] = useState<{ name?: string; type?: string }>({})
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const businessType = businessTypeChoice === "Other" ? customBusinessType.trim() : businessTypeChoice

  const validateBusiness = () => {
    const nextErrors: { name?: string; type?: string } = {}
    const name = businessName.trim()
    if (!name) nextErrors.name = "Enter your business name."
    else if (name.length > 160) nextErrors.name = "Business name must be 160 characters or fewer."
    if (!businessType) nextErrors.type = "Choose or enter a business type."
    else if (businessType.length > 80) nextErrors.type = "Business type must be 80 characters or fewer."
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleBusinessNext = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (validateBusiness()) setStep(2)
  }

  const toggleModule = (module: OptionalModule) => {
    setSelectedModules((current) => current.includes(module)
      ? current.filter((item) => item !== module)
      : [...current, module])
  }

  const finishOnboarding = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setFormError("")
    try {
      await completeOnboarding({
        name: businessName.trim(),
        businessType,
        enabledModules: selectedModules,
      })
      navigate("/dashboard", { replace: true })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "We couldn't finish setup. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <ol aria-label="Onboarding progress" className="mb-8 grid grid-cols-4 gap-2">
        {steps.map((label, index) => (
          <li className="text-center" key={label}>
            <span aria-current={step === index ? "step" : undefined} className={`mx-auto flex size-8 items-center justify-center rounded-full text-sm font-semibold ${index <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {index < step ? <Check aria-label="Complete" className="size-4" /> : index + 1}
            </span>
            <span className="mt-2 hidden text-xs text-muted-foreground sm:block">{label}</span>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-9">
        {step === 0 && (
          <div className="py-4 text-center sm:py-8">
            <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles aria-hidden="true" /></span>
            <p className="mt-6 text-sm font-medium text-primary">A few quick steps</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Set up your StockPilot workspace</h1>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-muted-foreground">Start with inventory, then choose only the tools that fit how your business works. You can keep things simple.</p>
            <Button className="mt-7" onClick={() => setStep(1)} size="lg">Get started<ChevronRight aria-hidden="true" className="ml-2 size-4" /></Button>
          </div>
        )}

        {step === 1 && (
          <form noValidate onSubmit={handleBusinessNext}>
            <p className="text-sm font-medium text-primary">Step 2 of 4</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Tell us about your business</h1>
            <p className="mt-2 text-muted-foreground">This identifies your workspace. You can adjust these details later.</p>
            <div className="mt-7 space-y-5">
              <FormField autoComplete="organization" autoFocus error={errors.name} id="business-name" label="Business name" onChange={(event) => setBusinessName(event.target.value)} placeholder="Northstar Market" value={businessName} />
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="business-type">Business type</label>
                <select aria-describedby={errors.type ? "business-type-error" : undefined} aria-invalid={Boolean(errors.type)} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" id="business-type" onChange={(event) => setBusinessTypeChoice(event.target.value)} value={businessTypeChoice}>
                  <option value="">Select a type</option>
                  {businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                {businessTypeChoice === "Other" && <FormField autoFocus error={errors.type} id="custom-business-type" label="Custom business type" maxLength={80} onChange={(event) => setCustomBusinessType(event.target.value)} placeholder="Describe your business" value={customBusinessType} />}
                {errors.type && businessTypeChoice !== "Other" && <p className="text-sm text-destructive" id="business-type-error">{errors.type}</p>}
              </div>
            </div>
            <div className="mt-8 flex justify-between"><Button onClick={() => setStep(0)} type="button" variant="outline"><ChevronLeft className="mr-2 size-4" />Back</Button><Button type="submit">Continue<ChevronRight className="ml-2 size-4" /></Button></div>
          </form>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm font-medium text-primary">Step 3 of 4</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Choose what StockPilot manages</h1>
            <p className="mt-2 text-muted-foreground">Inventory is always included. Everything else is optional.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-not-allowed gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <input aria-label="Inventory, always enabled" checked className="mt-1 size-4 accent-primary" disabled readOnly type="checkbox" />
                <span><span className="flex items-center gap-2 font-medium">Inventory <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Core</span></span><span className="mt-1 block text-sm leading-5 text-muted-foreground">Always enabled for products, stock levels, and movements.</span></span>
              </label>
              {optionalModules.map((module) => {
                const selected = selectedModules.includes(module.key)
                return (
                  <button aria-checked={selected} className={`flex gap-3 rounded-lg border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60"}`} key={module.key} onClick={() => toggleModule(module.key)} role="checkbox" type="button">
                    <span aria-hidden="true" className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected && <Check className="size-3.5" />}</span>
                    <span><span className="font-medium">{module.label}</span><span className="mt-1 block text-sm leading-5 text-muted-foreground">{module.description}</span></span>
                  </button>
                )
              })}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Selecting none is perfectly fine—you can begin with Inventory only.</p>
            <div className="mt-8 flex justify-between"><Button onClick={() => setStep(1)} type="button" variant="outline"><ChevronLeft className="mr-2 size-4" />Back</Button><Button onClick={() => setStep(3)} type="button">Review setup<ChevronRight className="ml-2 size-4" /></Button></div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="text-sm font-medium text-primary">Step 4 of 4</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Review your setup</h1>
            <p className="mt-2 text-muted-foreground">Confirm these details before creating your workspace.</p>
            <dl className="mt-7 divide-y divide-border rounded-lg border border-border">
              <div className="grid gap-1 p-4 sm:grid-cols-3"><dt className="text-sm text-muted-foreground">Business name</dt><dd className="font-medium sm:col-span-2">{businessName.trim()}</dd></div>
              <div className="grid gap-1 p-4 sm:grid-cols-3"><dt className="text-sm text-muted-foreground">Business type</dt><dd className="font-medium sm:col-span-2">{businessType}</dd></div>
              <div className="grid gap-2 p-4 sm:grid-cols-3"><dt className="text-sm text-muted-foreground">Included tools</dt><dd className="flex flex-wrap gap-2 sm:col-span-2"><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">Inventory</span>{selectedModules.map((module) => <span className="rounded-full bg-muted px-3 py-1 text-sm" key={module}>{getModuleLabel(module)}</span>)}</dd></div>
            </dl>
            {selectedModules.length === 0 && <div className="mt-4 flex gap-3 rounded-lg bg-muted p-4 text-sm"><PackageCheck aria-hidden="true" className="size-5 shrink-0 text-primary" /><p>You are starting with Inventory only. Optional modules can be enabled later.</p></div>}
            {formError && <p className="mt-5 rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive" role="alert">{formError}</p>}
            <div className="mt-8 flex justify-between"><Button disabled={isSubmitting} onClick={() => setStep(2)} type="button" variant="outline"><ChevronLeft className="mr-2 size-4" />Back</Button><Button disabled={isSubmitting} onClick={() => void finishOnboarding()} type="button">{isSubmitting ? "Creating workspace…" : "Finish setup"}</Button></div>
          </div>
        )}
      </div>
    </section>
  )
}
