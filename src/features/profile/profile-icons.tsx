/* eslint-disable react-refresh/only-export-components -- icon registry and renderer intentionally share one module */
import { BriefcaseBusiness, CircleUserRound, Leaf, Sparkles, Sun } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export const profileAvatarOptions = [
  { id: "user", label: "User", icon: CircleUserRound },
  { id: "sun", label: "Sun", icon: Sun },
  { id: "leaf", label: "Leaf", icon: Leaf },
  { id: "sparkles", label: "Sparkles", icon: Sparkles },
  { id: "briefcase", label: "Briefcase", icon: BriefcaseBusiness },
] as const

export type ProfileAvatarId = (typeof profileAvatarOptions)[number]["id"]

export function ProfileAvatarIcon({ id, className }: { id: ProfileAvatarId; className?: string }) {
  const Icon: LucideIcon = profileAvatarOptions.find((option) => option.id === id)?.icon ?? CircleUserRound
  return <Icon aria-hidden="true" className={className} />
}
