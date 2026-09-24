import { useEffect, useRef, useState } from "react"

import { BusinessLogo } from "@/components/branding/business-logo"
import { Button } from "@/components/ui/button"
import { useBusiness } from "@/features/business/business-context"

interface BusinessBrandingCardProps {
  compact?: boolean
}

export function BusinessBrandingCard({ compact = false }: BusinessBrandingCardProps) {
  const { business, role, setBusinessLogo, removeBusinessLogo } = useBusiness()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const canManage = role === "owner"

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  if (!business) return null

  const chooseLogo = async (file: File) => {
    const nextPreview = URL.createObjectURL(file)
    setPreviewUrl(nextPreview)
    setError("")
    try {
      await setBusinessLogo(file)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't update the business logo. Please try again.")
    } finally {
      URL.revokeObjectURL(nextPreview)
      setPreviewUrl(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return <section aria-labelledby={compact ? "dashboard-business-profile-title" : "business-profile-title"} className={`rounded-xl border border-border bg-card ${compact ? "p-4" : "p-5 shadow-sm sm:p-6"}`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <BusinessLogo className={compact ? "size-12 rounded-lg" : "size-16 rounded-lg"} iconId={business.iconId} name={business.name} path={business.logoPath} src={previewUrl} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{compact ? "Business profile" : "Business identity"}</p>
          <h2 className="mt-0.5 truncate text-lg font-semibold" id={compact ? "dashboard-business-profile-title" : "business-profile-title"}>{business.name}</h2>
          {!compact && <p className="mt-1 text-sm text-muted-foreground">Keep your business name, logo, and fallback icon easy to recognize.</p>}
        </div>
      </div>
      {canManage && <div className="flex shrink-0 flex-wrap gap-2">
        <Button onClick={() => inputRef.current?.click()} size="sm" variant={business.logoPath ? "outline" : "default"}>{business.logoPath ? "Change logo" : "Add business logo"}</Button>
        {business.logoPath && <Button onClick={() => { setError(""); void removeBusinessLogo().catch((cause) => setError(cause instanceof Error ? cause.message : "We couldn't remove the business logo. Please try again.")) }} size="sm" variant="ghost">Remove logo</Button>}
        <input aria-label="Business logo upload" accept="image/jpeg,image/png,image/webp" className="sr-only" ref={inputRef} onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseLogo(file) }} type="file" />
      </div>}
    </div>
    {!canManage && <p className="mt-3 text-sm text-muted-foreground">Business branding is managed by the owner.</p>}
    {error && <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
  </section>
}
