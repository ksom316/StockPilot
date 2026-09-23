export type NotificationType = "low_stock" | "out_of_stock" | "opportunity_attention" | "invitation_available" | "membership_status_changed"
export type NotificationSeverity = "info" | "warning" | "critical"

export interface NotificationItem {
  id: string
  businessId: string
  recipientUserId: string
  type: NotificationType
  title: string
  message: string
  severity: NotificationSeverity
  entityType: "product" | "opportunity" | "invitation" | "membership" | null
  entityId: string | null
  createdAt: string
  readAt: string | null
}

export class NotificationDataError extends Error {
  constructor(message: string, public readonly code?: string) { super(message) }
}
