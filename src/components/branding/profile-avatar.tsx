import { cn } from "@/lib/utils"
import { brandingPublicUrl, makeInitials } from "@/features/branding/branding-media"
import { ProfileAvatarIcon, type ProfileAvatarId } from "@/features/profile/profile-icons"

interface ProfileAvatarProps {
  avatarId?: ProfileAvatarId
  label: string
  path: string | null
  src?: string | null
  className?: string
}

export function ProfileAvatar({ avatarId = "user", label, path, src, className }: ProfileAvatarProps) {
  const url = src ?? brandingPublicUrl(path)
  return (
    <span aria-label={label} className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary", className)} role="img">
      {url ? <img alt="" className="size-full object-cover" decoding="async" src={url} /> : avatarId !== "user" ? <ProfileAvatarIcon className="size-1/2" id={avatarId} /> : makeInitials(label)}
    </span>
  )
}
