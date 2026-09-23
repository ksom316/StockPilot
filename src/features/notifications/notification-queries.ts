import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useBusiness } from "@/features/business/business-context"
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "./notification-service"
import type { NotificationItem } from "./notification-types"

export const notificationKeys = { list: (businessId: string) => ["notifications", businessId] as const }

export function useNotificationSummary() {
  const { business } = useBusiness()
  const [items, setItems] = useState<NotificationItem[]>([])
  useEffect(() => {
    let current = true
    if (!business?.id) return () => { current = false }
    void fetchNotifications(business.id).then((next) => { if (current) setItems(next) }).catch(() => { if (current) setItems([]) })
    return () => { current = false }
  }, [business?.id])
  return items
}

export function useNotifications() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  return useQuery({ queryKey: notificationKeys.list(businessId), queryFn: () => fetchNotifications(businessId), enabled: Boolean(businessId), staleTime: 15_000 })
}

export function useNotificationMutations() {
  const { business } = useBusiness()
  const businessId = business?.id ?? ""
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.list(businessId) })
  return {
    markRead: useMutation({ mutationFn: (id: string) => markNotificationRead(id), onSuccess: refresh }),
    markAllRead: useMutation({ mutationFn: () => markAllNotificationsRead(businessId), onSuccess: refresh }),
  }
}
