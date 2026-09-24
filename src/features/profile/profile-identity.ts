import { useCallback, useEffect, useState } from "react"

import { brandingPublicUrl, removeProfileImage, replaceProfileImage } from "@/features/branding/branding-media"
import type { ProfileAvatarId } from "@/features/profile/profile-icons"
import { supabase } from "@/lib/supabase"

const validAvatarIds: readonly ProfileAvatarId[] = ["user", "sun", "leaf", "sparkles", "briefcase"]

function isProfileAvatarId(value: unknown): value is ProfileAvatarId {
  return typeof value === "string" && validAvatarIds.includes(value as ProfileAvatarId)
}

export function useProfileIdentity(userId: string | null) {
  const [avatarId, setAvatarId] = useState<ProfileAvatarId>("user")
  const [displayName, setDisplayName] = useState("User")
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    if (!userId || !supabase) {
      return () => { active = false }
    }
    // Reset identity immediately when the authenticated account changes so a
    // previous user's photo cannot flash in the next account's UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatarId("user")
    setDisplayName("User")
    setAvatarPath(null)
    setError("")
    void supabase.from("profiles").select("avatar_id, avatar_path, display_name").eq("id", userId).maybeSingle().then(({ data }) => {
      if (!active) return
      if (isProfileAvatarId(data?.avatar_id)) setAvatarId(data.avatar_id)
      if (typeof data?.display_name === "string") setDisplayName(data.display_name)
      if (typeof data?.avatar_path === "string") setAvatarPath(data.avatar_path)
    })
    return () => { active = false }
  }, [userId])

  const updateAvatar = useCallback(async (nextAvatarId: ProfileAvatarId) => {
    if (!userId || !supabase) throw new Error("Your profile is unavailable. Refresh and try again.")
    setIsUpdating(true)
    setError("")
    try {
      const { error } = await supabase.from("profiles").update({ avatar_id: nextAvatarId }).eq("id", userId)
      if (error) throw new Error("We couldn't update your profile icon. Please try again.")
      setAvatarId(nextAvatarId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't update your profile icon. Please try again.")
      throw cause
    } finally {
      setIsUpdating(false)
    }
  }, [userId])

  const uploadAvatar = useCallback(async (file: File) => {
    if (!userId) throw new Error("Your profile is unavailable. Refresh and try again.")
    setIsUpdating(true)
    setError("")
    try {
      const result = await replaceProfileImage(userId, file, avatarPath)
      setAvatarPath(result.path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't upload your profile photo. Please try again.")
      throw cause
    } finally {
      setIsUpdating(false)
    }
  }, [avatarPath, userId])

  const removeAvatar = useCallback(async () => {
    if (!userId) throw new Error("Your profile is unavailable. Refresh and try again.")
    setIsUpdating(true)
    setError("")
    try {
      await removeProfileImage(userId, avatarPath)
      setAvatarPath(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't remove your profile photo. Please try again.")
      throw cause
    } finally {
      setIsUpdating(false)
    }
  }, [avatarPath, userId])

  return { avatarId, displayName, avatarPath, avatarUrl: brandingPublicUrl(avatarPath), error, isUpdating, updateAvatar, uploadAvatar, removeAvatar }
}
