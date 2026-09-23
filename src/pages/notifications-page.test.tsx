import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NotificationsPage } from "./notifications-page"

const mocks = vi.hoisted(() => ({ useNotifications: vi.fn(), useNotificationMutations: vi.fn() }))
vi.mock("@/features/notifications/notification-queries", () => mocks)

const item = { id: "n1", businessId: "b1", recipientUserId: "u1", type: "low_stock", title: "Product is low in stock", message: "Coffee Beans is at or below its low-stock threshold.", severity: "warning", entityType: "product", entityId: "p1", createdAt: "2026-09-23T12:00:00.000Z", readAt: null } as const

describe("NotificationsPage", () => {
  beforeEach(() => { mocks.useNotifications.mockReset(); mocks.useNotificationMutations.mockReset() })
  it("shows unread notifications, count actions, and safe entity navigation", () => {
    const markRead = vi.fn()
    const markAllRead = vi.fn()
    mocks.useNotifications.mockReturnValue({ data: [item], isLoading: false, isError: false })
    mocks.useNotificationMutations.mockReturnValue({ markRead: { isPending: false, mutate: markRead }, markAllRead: { isPending: false, mutate: markAllRead } })
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>)
    expect(screen.getByText("Unread")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open inventory" })).toHaveAttribute("href", "/inventory")
    screen.getByRole("button", { name: "Mark as read" }).click()
    expect(markRead).toHaveBeenCalledWith("n1")
  })

  it("renders the empty state and disables mark-all when there are no unread items", () => {
    mocks.useNotifications.mockReturnValue({ data: [], isLoading: false, isError: false })
    const markAllRead = vi.fn()
    mocks.useNotificationMutations.mockReturnValue({ markRead: { isPending: false, mutate: vi.fn() }, markAllRead: { isPending: false, mutate: markAllRead } })
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>)
    expect(screen.getByText("You’re all caught up")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled()
  })
})
