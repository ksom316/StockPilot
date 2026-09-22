import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"
import { DialogShell } from "@/components/ui/dialog-shell"

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return <><Button onClick={() => setOpen(true)}>Open dialog</Button>{open && <DialogShell description="Keyboard dialog test" onClose={() => setOpen(false)} title="Test dialog"><button type="button">First action</button><button type="button">Last action</button></DialogShell>}</>
}

describe("DialogShell keyboard behavior", () => {
  it("traps Tab focus and restores focus to the opener when closed", () => {
    render(<DialogHarness />)
    const opener = screen.getByRole("button", { name: "Open dialog" })
    opener.focus()
    fireEvent.click(opener)

    const close = screen.getByRole("button", { name: "Close dialog" })
    const last = screen.getByRole("button", { name: "Last action" })
    expect(document.activeElement).toBe(close)

    last.focus()
    fireEvent.keyDown(document, { key: "Tab" })
    expect(document.activeElement).toBe(close)

    close.focus()
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(document.activeElement).toBe(opener)
  })
})
