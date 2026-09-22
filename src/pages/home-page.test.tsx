import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { HomePage } from "@/pages/home-page"

describe("HomePage", () => {
  it("introduces the inventory-first product", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole("heading", { name: /foundation for growing businesses/i })).toBeInTheDocument()
    expect(screen.getByText(/starts with inventory/i)).toBeInTheDocument()
  })
})
