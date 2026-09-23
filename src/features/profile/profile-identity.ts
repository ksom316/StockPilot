import { useCallback, useEffect, useState } from "react"

import type { ProfileAvatarId } from "@/features/profile/profile-icons"
import { supabase } from "@/lib/supabase"

const validAvatarIds: readonly ProfileAvatarId[] = ["user", "sun", "leaf", "sparkles", "briefcase"]

function isProfileAvatarId(value: unknown): value is ProfileAvatarId {
  return typeof value === "string" && validAvatarIds.includes(value as ProfileAvatarId)
}

export function useProfileIdentity(userId: string | null) {
  const [avatarId, setAvatarId] = useState<ProfileAvatarId>("user")
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    let active = true
    if (!userId || !supabase) {
      return () => { active = false }
    }
    void supabase.from("profiles").select("avatar_id").eq("id", userId).maybeSingle().then(({ data }) => {
      if (active && isProfileAvatarId(data?.avatar_id)) setAvatarId(data.avatar_id)
    })
    return () => { active = false }
  }, [userId])

  const updateAvatar = useCallback(async (nextAvatarId: ProfileAvatarId) => {
    if (!userId || !supabase) throw new Error("Your profile is unavailable. Refresh and try again.")
    setIsUpdating(true)
    try {
      const { error } = await supabase.from("profiles").update({ avatar_id: nextAvatarId }).eq("id", userId)
      if (error) throw new Error("We couldn't update your profile icon. Please try again.")
      setAvatarId(nextAvatarId)
    } finally {
      setIsUpdating(false)
    }
  }, [userId])

  return { avatarId, isUpdating, updateAvatar }
}
