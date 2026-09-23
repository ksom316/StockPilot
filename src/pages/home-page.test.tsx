import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { HomePage } from "@/pages/home-page"

describe("HomePage", () => {
  it("communicates the inventory-first product and exposes public actions", () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>)
    expect(screen.getByRole("heading", { name: /know what is happening/i })).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /get started/i })[0]).toHaveAttribute("href", "/signup")
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    expect(screen.getByRole("heading", { name: /built around how a business actually runs/i })).toBeInTheDocument()
    expect(screen.getByLabelText("StockPilot product preview")).toBeInTheDocument()
    expect(screen.getByText("Recorded data")).toBeInTheDocument()
    expect(screen.getByText("Optional AI explanation")).toBeInTheDocument()
  })
})
