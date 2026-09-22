import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"

export function HomePage() {
  return (
    <section className="max-w-2xl space-y-5">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Inventory, clearly managed</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">A focused foundation for growing businesses.</h1>
      <p className="text-lg leading-8 text-muted-foreground">
        StockPilot starts with inventory and grows through optional business modules when you need them.
      </p>
      <Button asChild>
        <Link to="/signup">Get started</Link>
      </Button>
    </section>
  )
}
