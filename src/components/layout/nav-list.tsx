import { NavLink } from "react-router-dom"

import type { NavGroup } from "@/components/layout/nav-config"
import { cn } from "@/lib/utils"

interface NavListProps {
  groups: NavGroup[]
  collapsed?: boolean
  onNavigate?: () => void
}

/** Grouped navigation list shared by the desktop sidebar and the mobile navigation drawer. */
export function NavList({ groups, collapsed = false, onNavigate }: NavListProps) {
  return (
    <nav aria-label="Workspace navigation" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
      {groups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted-foreground/80">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.label}>
                {item.disabled ? (
                  <span
                    aria-disabled="true"
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-muted-foreground/70",
                      collapsed && "justify-center px-0",
                    )}
                    title={item.disabledReason ?? `${item.label} is coming soon`}
                  >
                    <item.icon aria-hidden="true" className="size-[18px] shrink-0" />
                    {!collapsed && (
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate">{item.label}</span>
                        <span aria-hidden="true" className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Soon</span>
                      </span>
                    )}
                    <span className="sr-only">, coming soon</span>
                  </span>
                ) : (
                  <NavLink
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 rounded-md py-2 pl-2.5 pr-2.5 text-sm font-medium text-sidebar-foreground/90 outline-none transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-primary/50",
                        isActive && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
                        collapsed && "justify-center px-0",
                      )
                    }
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    to={item.to}
                  >
                    {({ isActive }) => <>
                      <span aria-hidden="true" className={cn("absolute inset-y-1 left-0 w-0.5 rounded-full bg-sidebar-primary transition-opacity duration-150", isActive ? "opacity-100" : "opacity-0")} />
                      <item.icon aria-hidden="true" className={cn("size-[18px] shrink-0 transition-colors duration-150", isActive ? "text-sidebar-primary" : "text-sidebar-muted-foreground group-hover:text-sidebar-accent-foreground")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </>}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
