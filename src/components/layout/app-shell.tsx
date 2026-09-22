import { Link, NavLink, Outlet } from "react-router-dom"

const navigation = [
  { label: "Home", to: "/" },
  { label: "Dashboard", to: "/dashboard" },
]

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link className="text-lg font-semibold tracking-tight" to="/">
            StockPilot
          </Link>
          <nav aria-label="Primary navigation" className="flex items-center gap-5 text-sm">
            {navigation.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  isActive ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                }
                end={item.to === "/"}
                key={item.to}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
            <Link className="text-muted-foreground hover:text-foreground" to="/login">
              Log in
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-12">
        <Outlet />
      </main>
    </div>
  )
}
