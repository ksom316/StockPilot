import { Pencil, Plus } from "lucide-react"
import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { DialogShell } from "@/components/ui/dialog-shell"
import { InventoryDataError } from "@/features/inventory/inventory-service"
import type { Category, CategoryInput } from "@/features/inventory/inventory-types"

interface CategoryManagerDialogProps {
  categories: Category[]
  onClose: () => void
  onCreate: (input: CategoryInput) => Promise<void>
  onUpdate: (id: string, input: CategoryInput) => Promise<void>
}

export function CategoryManagerDialog({ categories, onClose, onCreate, onUpdate }: CategoryManagerDialogProps) {
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<Category | null>(null)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Enter a category name.")
      return
    }
    if (trimmedName.length > 120) {
      setError("Category name must be 120 characters or fewer.")
      return
    }

    setError("")
    setIsSubmitting(true)
    try {
      if (editing) await onUpdate(editing.id, { name: trimmedName })
      else await onCreate({ name: trimmedName })
      setName("")
      setEditing(null)
    } catch (caught) {
      if (caught instanceof InventoryDataError && caught.code === "23505") setError("A category with this name already exists.")
      else setError(caught instanceof Error ? caught.message : "We couldn't save this category.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DialogShell description="Create and rename categories for this business." onClose={onClose} title="Manage categories">
      <form className="flex gap-2" noValidate onSubmit={submit}>
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="category-name">Category name</label>
          <input aria-describedby={error ? "category-error" : undefined} aria-invalid={Boolean(error)} autoFocus className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20" disabled={isSubmitting} id="category-name" maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Category name" value={name} />
        </div>
        <Button disabled={isSubmitting} type="submit">{editing ? "Rename" : <><Plus aria-hidden="true" className="mr-1 size-4" />Add</>}</Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive" id="category-error" role="alert">{error}</p>}
      {editing && <button className="mt-2 text-sm text-muted-foreground underline" onClick={() => { setEditing(null); setName(""); setError("") }} type="button">Cancel rename</button>}
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
        {categories.length === 0 && <li className="p-4 text-sm text-muted-foreground">No categories yet.</li>}
        {categories.map((category) => (
          <li className="flex items-center justify-between gap-3 p-3" key={category.id}>
            <span className="min-w-0 truncate text-sm font-medium">{category.name}</span>
            <Button aria-label={`Rename ${category.name}`} onClick={() => { setEditing(category); setName(category.name); setError("") }} size="sm" type="button" variant="outline"><Pencil aria-hidden="true" className="size-3.5" /></Button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">Category deletion is unavailable because products may reference categories.</p>
    </DialogShell>
  )
}
