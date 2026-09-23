/* eslint-disable react-refresh/only-export-components -- icon registry and renderer intentionally share one module */
import { Building2, Landmark, ShoppingBag, Store, Warehouse } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export const businessIconOptions = [
  { id: "store", label: "Store", icon: Store },
  { id: "building", label: "Building", icon: Building2 },
  { id: "warehouse", label: "Warehouse", icon: Warehouse },
  { id: "landmark", label: "Landmark", icon: Landmark },
  { id: "shopping-bag", label: "Shopping bag", icon: ShoppingBag },
] as const

export type BusinessIconId = (typeof businessIconOptions)[number]["id"]

export function BusinessIcon({ id, className }: { id: BusinessIconId; className?: string }) {
  const Icon: LucideIcon = businessIconOptions.find((option) => option.id === id)?.icon ?? Store
  return <Icon aria-hidden="true" className={className} />
}
