import { Component, type ErrorInfo, type ReactNode } from "react"

interface AppErrorBoundaryProps { children: ReactNode }
interface AppErrorBoundaryState { hasError: boolean }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error("StockPilot render error", error, info)
  }

  retry = () => window.location.reload()
  goToDashboard = () => { window.location.assign("/dashboard") }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <section aria-labelledby="app-error-title" className="w-full max-w-lg rounded-xl border border-destructive/25 bg-card p-6 text-center shadow-sm" role="alert">
          <h1 className="text-xl font-semibold" id="app-error-title">StockPilot needs a refresh</h1>
          <p className="mt-2 text-muted-foreground">Something unexpected interrupted this page. Your saved data is unchanged.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" onClick={this.retry} type="button">Reload</button>
            <button className="rounded-md border border-border px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" onClick={this.goToDashboard} type="button">Go to Dashboard</button>
          </div>
        </section>
      </main>
    )
  }
}
