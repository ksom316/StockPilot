import { LogOut, Settings2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { ProfileAvatar } from "@/components/branding/profile-avatar"
import { cn } from "@/lib/utils"
import { ProfileAvatarIcon, profileAvatarOptions, type ProfileAvatarId } from "@/features/profile/profile-icons"

interface AccountMenuProps {
  label: string
  onSignOut: () => void
  isSigningOut: boolean
  avatarId: ProfileAvatarId
  avatarPath: string | null
  avatarLabel: string
  profileError: string
  isUpdatingAvatar: boolean
  onAvatarChange: (avatarId: ProfileAvatarId) => void
  onAvatarUpload: (file: File) => Promise<void>
  onAvatarRemove: () => Promise<void>
}

/** Compact account menu housing settings access and sign-out, used in the top header. */
export function AccountMenu({ label, avatarId, avatarPath, avatarLabel, isSigningOut, isUpdatingAvatar, profileError, onAvatarChange, onAvatarUpload, onAvatarRemove, onSignOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const choosePhoto = async (file: File) => {
    const nextPreview = URL.createObjectURL(file)
    setPreviewUrl(nextPreview)
    try {
      await onAvatarUpload(file)
    } catch {
      // The hook exposes the safe error state; restore the persisted image on failure.
    } finally {
      URL.revokeObjectURL(nextPreview)
      setPreviewUrl(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${label}`}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border text-muted-foreground outline-none transition-colors duration-150 hover:border-border-strong hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          open ? "border-border-strong bg-muted text-foreground" : "border-border bg-background",
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ProfileAvatar avatarId={avatarId} className="size-7 text-[10px]" label={avatarLabel} path={avatarPath} />
      </button>
      {open && (
        <div
          className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute right-0 z-40 mt-2 w-56 origin-top-right rounded-md border border-border bg-card p-1 shadow-md duration-150"
          role="menu"
        >
          <p className="truncate px-2.5 py-1.5 text-xs text-muted-foreground" title={label}>{label}</p>
          <div className="border-b border-border px-2.5 pb-2 pt-1">
            <div className="flex items-center gap-2">
              <ProfileAvatar avatarId={avatarId} className="size-10" label={avatarLabel} path={avatarPath} src={previewUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">Profile photo</p>
                <p className="text-[11px] text-muted-foreground">JPEG, PNG, or WebP up to 5 MB</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50" disabled={isUpdatingAvatar} onClick={() => fileInputRef.current?.click()} type="button">{isUpdatingAvatar ? "Saving…" : avatarPath ? "Change photo" : "Upload photo"}</button>
              {avatarPath && <button className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" disabled={isUpdatingAvatar} onClick={() => void onAvatarRemove()} type="button">Remove</button>}
              <input accept="image/jpeg,image/png,image/webp" className="sr-only" ref={fileInputRef} onChange={(event) => { const file = event.target.files?.[0]; if (file) void choosePhoto(file) }} type="file" />
            </div>
            {profileError && <p className="mt-2 text-xs text-destructive" role="alert">{profileError}</p>}
            <p className="mb-1.5 mt-3 text-xs font-medium text-foreground">Profile fallback icon</p>
            <div className="flex gap-1" role="group" aria-label="Profile icon choices">
              {profileAvatarOptions.map((option) => (
                <button
                  aria-label={option.label}
                  aria-pressed={avatarId === option.id}
                  className={cn("flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted", avatarId === option.id && "bg-primary/10 text-primary")}
                  disabled={isUpdatingAvatar}
                  key={option.id}
                  onClick={() => onAvatarChange(option.id)}
                  type="button"
                >
                  <ProfileAvatarIcon className="size-4" id={option.id} />
                </button>
              ))}
            </div>
          </div>
          <Link
            className={cn(
              "flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted",
            )}
            onClick={() => setOpen(false)}
            role="menuitem"
            to="/settings/modules"
          >
            <Settings2 aria-hidden="true" className="size-4" />
            Modules &amp; settings
          </Link>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50"
            disabled={isSigningOut}
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            role="menuitem"
            type="button"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  )
}
