import { BusinessIcon, type BusinessIconId } from "@/features/business/business-icons"
import { brandingPublicUrl } from "@/features/branding/branding-media"
import { cn } from "@/lib/utils"

interface BusinessLogoProps {
  iconId: BusinessIconId
  name: string
  path: string | null
  src?: string | null
  className?: string
}

export function BusinessLogo({ iconId, name, path, src, className }: BusinessLogoProps) {
  const url = src ?? brandingPublicUrl(path)
  return (
    <span aria-label={`${name} logo`} className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary", className)} role="img">
      {url ? <img alt="" className="size-full object-cover" decoding="async" src={url} /> : <BusinessIcon className="size-1/2" id={iconId} />}
    </span>
  )
}
