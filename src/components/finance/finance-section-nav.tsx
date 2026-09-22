import { NavLink } from "react-router-dom"

const linkClass = ({ isActive }: { isActive: boolean }) => isActive
  ? "rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
  : "rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"

export function FinanceSectionNav() {
  return <nav aria-label="Finance navigation" className="flex flex-wrap gap-2 border-b border-border pb-3">
    <NavLink className={linkClass} end to="/finance">Overview</NavLink>
    <NavLink className={linkClass} to="/finance/expenses">Expenses</NavLink>
  </nav>
}
