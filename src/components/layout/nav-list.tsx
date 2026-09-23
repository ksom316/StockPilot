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
    <nav aria-label="Workspace navigation" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
              {group.label}
            </p>
          )}
          <ul className={cn("space-y-0.5", !collapsed && "mt-1.5")}>
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
                    <item.icon aria-hidden="true" className="size-4 shrink-0" />
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
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-primary/50",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                        collapsed && "justify-center px-0",
                      )
                    }
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    to={item.to}
                  >
                    <item.icon aria-hidden="true" className="size-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
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
