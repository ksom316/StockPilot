import { supabase } from "@/lib/supabase"
import { NotificationDataError, type NotificationItem, type NotificationSeverity, type NotificationType } from "./notification-types"

function requireClient() {
  if (!supabase) throw new NotificationDataError("Notifications are not configured.")
  return supabase
}

function parse(value: unknown): NotificationItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NotificationDataError("Notifications returned an invalid item.")
  const item = value as Record<string, unknown>
  const type = item.notification_type
  const severity = item.severity
  if (typeof item.id !== "string" || typeof item.business_id !== "string" || typeof item.recipient_user_id !== "string" || typeof item.title !== "string" || typeof item.message !== "string" || typeof item.created_at !== "string" || (item.read_at !== null && typeof item.read_at !== "string") || !["low_stock", "out_of_stock", "opportunity_attention", "invitation_available", "membership_status_changed"].includes(String(type)) || !["info", "warning", "critical"].includes(String(severity))) throw new NotificationDataError("Notifications returned an invalid item.")
  const entityType = item.entity_type
  if (entityType !== null && !["product", "opportunity", "invitation", "membership"].includes(String(entityType))) throw new NotificationDataError("Notifications returned an invalid entity reference.")
  return { id: item.id, businessId: item.business_id, recipientUserId: item.recipient_user_id, type: type as NotificationType, title: item.title, message: item.message, severity: severity as NotificationSeverity, entityType: entityType as NotificationItem["entityType"], entityId: typeof item.entity_id === "string" ? item.entity_id : null, createdAt: item.created_at, readAt: item.read_at as string | null }
}

export async function fetchNotifications(businessId: string): Promise<NotificationItem[]> {
  const { data, error } = await requireClient().rpc("get_notifications", { p_business_id: businessId, p_limit: 100 })
  if (error) throw new NotificationDataError("We couldn't load notifications. Please try again.", error.code)
  if (!Array.isArray(data)) throw new NotificationDataError("Notifications returned an invalid response.")
  return data.map(parse)
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await requireClient().rpc("mark_notification_read", { p_notification_id: notificationId })
  if (error) throw new NotificationDataError("We couldn't update this notification. Please try again.", error.code)
}

export async function markAllNotificationsRead(businessId: string) {
  const { error } = await requireClient().rpc("mark_all_notifications_read", { p_business_id: businessId })
  if (error) throw new NotificationDataError("We couldn't update notifications. Please try again.", error.code)
}
