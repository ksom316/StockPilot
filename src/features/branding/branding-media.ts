import { supabase } from "@/lib/supabase"

export const BRANDING_BUCKET = "branding"
export const MAX_BRANDING_IMAGE_BYTES = 5 * 1024 * 1024
export const BRANDING_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

type BrandingImageType = (typeof BRANDING_IMAGE_TYPES)[number]
type ImageOwner = "profile" | "business"

const extensionByType: Record<BrandingImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export function validateBrandingImage(file: File): string | null {
  if (!BRANDING_IMAGE_TYPES.includes(file.type as BrandingImageType)) {
    return "Choose a JPEG, PNG, or WebP image."
  }
  if (file.size > MAX_BRANDING_IMAGE_BYTES) {
    return "Images must be 5 MB or smaller."
  }
  return null
}

export function brandingObjectPath(owner: ImageOwner, ownerId: string, fileType: BrandingImageType, id = makeVersionId()) {
  return `${owner === "profile" ? "profiles" : "businesses"}/${ownerId}/${id}.${extensionByType[fileType]}`
}

export function brandingPublicUrl(path: string | null): string | null {
  if (!path || !supabase) return null
  return supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path).data.publicUrl
}

export function makeInitials(label: string | null | undefined): string {
  const words = (label ?? "User").trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "U"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

async function removeObject(path: string | null) {
  if (!path || !supabase) return
  await supabase.storage.from(BRANDING_BUCKET).remove([path])
}

async function uploadObject(path: string, file: File) {
  if (!supabase) throw new Error("Image storage is not configured. Please try again later.")
  const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error("We couldn't upload that image. Please try again.")
}

async function replacePath(
  owner: ImageOwner,
  ownerId: string,
  file: File,
  currentPath: string | null,
): Promise<{ path: string; url: string | null }> {
  const validationError = validateBrandingImage(file)
  if (validationError) throw new Error(validationError)
  if (!supabase) throw new Error("Image storage is not configured. Please try again later.")

  const path = brandingObjectPath(owner, ownerId, file.type as BrandingImageType)
  await uploadObject(path, file)
  const table = owner === "profile" ? "profiles" : "businesses"
  const column = owner === "profile" ? "avatar_path" : "logo_path"
  const { error } = await supabase.from(table).update({ [column]: path }).eq("id", ownerId)
  if (error) {
    await removeObject(path)
    throw new Error("We couldn't save that image. Please try again.")
  }

  // Metadata is authoritative. A failed cleanup leaves only an unreachable,
  // versioned object and never removes the current image.
  await removeObject(currentPath)
  return { path, url: brandingPublicUrl(path) }
}

async function clearPath(owner: ImageOwner, ownerId: string, currentPath: string | null) {
  if (!supabase) throw new Error("Image storage is not configured. Please try again later.")
  const table = owner === "profile" ? "profiles" : "businesses"
  const column = owner === "profile" ? "avatar_path" : "logo_path"
  const { error } = await supabase.from(table).update({ [column]: null }).eq("id", ownerId)
  if (error) throw new Error("We couldn't remove that image. Please try again.")
  await removeObject(currentPath)
}

export const replaceProfileImage = (userId: string, file: File, currentPath: string | null) => replacePath("profile", userId, file, currentPath)
export const removeProfileImage = (userId: string, currentPath: string | null) => clearPath("profile", userId, currentPath)
export const replaceBusinessLogo = (businessId: string, file: File, currentPath: string | null) => replacePath("business", businessId, file, currentPath)
export const removeBusinessLogo = (businessId: string, currentPath: string | null) => clearPath("business", businessId, currentPath)

function makeVersionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
