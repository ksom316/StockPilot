import { describe, expect, it } from "vitest"

import { brandingObjectPath, makeInitials, MAX_BRANDING_IMAGE_BYTES, validateBrandingImage } from "@/features/branding/branding-media"

describe("branding media", () => {
  it("accepts supported image formats and rejects unsupported files", () => {
    expect(validateBrandingImage(new File(["image"], "avatar.png", { type: "image/png" }))).toBeNull()
    expect(validateBrandingImage(new File(["text"], "avatar.gif", { type: "image/gif" }))).toMatch(/JPEG, PNG, or WebP/i)
  })

  it("rejects images over the client-side size limit", () => {
    const file = new File([new Uint8Array(MAX_BRANDING_IMAGE_BYTES + 1)], "large.webp", { type: "image/webp" })
    expect(validateBrandingImage(file)).toMatch(/5 MB or smaller/i)
  })

  it("creates versioned, scope-specific paths", () => {
    expect(brandingObjectPath("profile", "user-1", "image/jpeg", "version-1")).toBe("profiles/user-1/version-1.jpg")
    expect(brandingObjectPath("business", "business-1", "image/webp", "version-2")).toBe("businesses/business-1/version-2.webp")
  })

  it("creates a clean initials fallback", () => {
    expect(makeInitials("Alex Morgan")).toBe("AM")
    expect(makeInitials("cashier@example.com")).toBe("CA")
    expect(makeInitials("")).toBe("U")
  })
})
