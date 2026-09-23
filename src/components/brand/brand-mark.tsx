interface BrandMarkProps {
  alt?: string
  className?: string
  decorative?: boolean
}

export function BrandMark({ alt = "StockPilot", className, decorative = false }: BrandMarkProps) {
  return (
    <img
      alt={decorative ? "" : alt}
      aria-hidden={decorative ? true : undefined}
      className={className}
      decoding="async"
      height="32"
      src="/stockpilot-icon.png"
      width="32"
    />
  )
}
