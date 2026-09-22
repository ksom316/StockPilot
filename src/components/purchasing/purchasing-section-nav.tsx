import { NavLink } from "react-router-dom"

const linkClass = ({ isActive }: { isActive: boolean }) => isActive
  ? "rounded-md bg-primary/10 px-3 py-2 font-medium text-primary"
  : "rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"

export function PurchasingSectionNav() {
  return <nav aria-label="Purchasing navigation" className="flex flex-wrap items-center gap-2 border-b border-border pb-3"><NavLink className={linkClass} end to="/purchasing">Receive stock</NavLink><NavLink className={linkClass} to="/purchasing/history">Purchase history</NavLink><NavLink className={linkClass} to="/purchasing/suppliers">Suppliers</NavLink></nav>
}
