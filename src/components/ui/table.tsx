import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

/** Rounded, bordered container that scrolls horizontally instead of squeezing a table unreadably. */
export function TableContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", className)} {...props} />
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-max text-left text-sm", className)} {...props} />
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors", className)} {...props} />
}

interface CellAlignProps {
  align?: "left" | "right"
}

export function Th({ className, align = "left", ...props }: ThHTMLAttributes<HTMLTableCellElement> & CellAlignProps) {
  return <th className={cn("whitespace-nowrap px-4 py-2.5 font-medium", align === "right" && "text-right", className)} {...props} />
}

export function Td({ className, align = "left", ...props }: TdHTMLAttributes<HTMLTableCellElement> & CellAlignProps) {
  return <td className={cn("px-4 py-3 align-top", align === "right" && "text-right", className)} {...props} />
}
