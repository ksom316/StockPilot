import {
  BarChart3,
  Boxes,
  History,
  LayoutDashboard,
  Lightbulb,
  Sparkles,
  Settings2,
  Store,
  Target,
  Truck,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { getModuleLabel, type OptionalModule } from "@/features/business/modules"
import type { Membership } from "@/features/business/business-context"

type BusinessRole = Membership["role"]

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  disabled?: boolean
  disabledReason?: string
  /** Require an exact path match for the active state (used when another nav item's path is a prefix of this one). */
  end?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

const purchasingRoles = ["owner", "manager", "employee"]
const smartInsightsRoles = ["owner", "manager", "employee"]
const managerRoles = ["owner", "manager"]

/**
 * Builds the grouped, module- and role-aware navigation structure shared by the
 * desktop sidebar and the mobile navigation drawer.
 */
export function buildNavGroups(enabledModules: readonly OptionalModule[], role: BusinessRole | null): NavGroup[] {
  const has = (module: OptionalModule) => enabledModules.includes(module)
  const roleIn = (roles: readonly string[]) => Boolean(role && roles.includes(role))

  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Operations",
      items: [
        { label: "Inventory", to: "/inventory", icon: Boxes, end: true },
        { label: "Movement History", to: "/inventory/movements", icon: History },
        ...(has("sales") ? [{ label: "Sales", to: "/sales", icon: Store }] : []),
        ...(has("purchasing") && roleIn(purchasingRoles) ? [{ label: "Purchasing", to: "/purchasing", icon: Truck }] : []),
      ],
    },
    {
      label: "Business",
      items: [
        ...(has("customers") ? [{ label: "Customers", to: "/customers", icon: Users }] : []),
        ...(has("expenses") && roleIn(managerRoles) ? [{ label: "Finance", to: "/finance", icon: Wallet }] : []),
        ...(has("analytics") ? [{ label: "Analytics", to: "/analytics", icon: BarChart3 }] : []),
        { label: "Reports", to: "/reports", icon: BarChart3 },
      ],
    },
    {
      label: "Intelligence",
      items: [
        ...(has("smart_insights") && roleIn(smartInsightsRoles) ? [{ label: "Smart Inventory", to: "/inventory/insights", icon: Lightbulb }] : []),
        ...(has("smart_insights") && roleIn(managerRoles) ? [{ label: "Opportunities", to: "/opportunities", icon: Target }] : []),
        ...(has("ai_analyst") && roleIn(managerRoles) ? [{ label: "AI Analyst", to: "/analyst", icon: Sparkles }] : []),
      ],
    },
    {
      label: "Organization",
      items: [
        ...(has("team") && roleIn(managerRoles) ? [{ label: "Team", to: "/team", icon: UsersRound }] : []),
        { label: "Settings", to: "/settings/modules", icon: Settings2 },
      ],
    },
  ]

  // Modules that are enabled but don't yet have a workspace surface (e.g. "analytics")
  // are shown as disabled entries so their presence is never a dead link.
  const recognized: OptionalModule[] = ["sales", "purchasing", "customers", "expenses", "analytics", "smart_insights", "ai_analyst", "team"]
  const unrecognized = enabledModules.filter((module) => !recognized.includes(module))
  if (unrecognized.length > 0) {
    groups.push({
      label: "Coming soon",
      items: unrecognized.map((module) => ({
        label: getModuleLabel(module),
        to: "#",
        icon: Boxes,
        disabled: true,
        disabledReason: `${getModuleLabel(module)} is coming soon`,
      })),
    })
  }

  return groups.filter((group) => group.items.length > 0)
}
