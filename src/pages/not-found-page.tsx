import { Link } from "react-router-dom"

export function NotFoundPage() {
  return (
    <section className="space-y-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The page you requested does not exist.</p>
      <Link className="inline-block text-sm font-medium underline underline-offset-4" to="/">
        Return home
      </Link>
    </section>
  )
}
