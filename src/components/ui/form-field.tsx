import type { InputHTMLAttributes } from "react"

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function FormField({ label, error, id, ...props }: FormFieldProps) {
  const errorId = `${id}-error`

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={id}>{label}</label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        id={id}
        {...props}
      />
      {error && <p className="text-sm text-destructive" id={errorId}>{error}</p>}
    </div>
  )
}
