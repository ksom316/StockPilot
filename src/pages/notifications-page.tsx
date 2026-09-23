import { Bell, CheckCheck, CircleAlert, Info, TriangleAlert } from "lucide-react"
import { Link } from "react-router-dom"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state"
import { useNotifications, useNotificationMutations } from "@/features/notifications/notification-queries"
import type { NotificationItem } from "@/features/notifications/notification-types"

function time(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) }
function icon(item: NotificationItem) { return item.severity === "critical" ? <CircleAlert aria-hidden="true" className="size-5 text-destructive" /> : item.severity === "warning" ? <TriangleAlert aria-hidden="true" className="size-5 text-amber-600" /> : <Info aria-hidden="true" className="size-5 text-primary" /> }
function action(item: NotificationItem) {
  if (item.entityType === "product") return "/inventory"
  if (item.entityType === "opportunity") return "/opportunities"
  if (item.entityType === "invitation") return "/team/accept"
  return null
}

export function NotificationsPage() {
  const query = useNotifications()
  const mutations = useNotificationMutations()
  const unread = (query.data ?? []).filter((item) => !item.readAt).length
  return <section className="space-y-6">
    <PageHeader actions={<Button disabled={!unread || mutations.markAllRead.isPending} onClick={() => mutations.markAllRead.mutate()} variant="outline"><CheckCheck aria-hidden="true" className="mr-2 size-4" />Mark all as read</Button>} description="Deterministic alerts and actions from your StockPilot workspace." eyebrow="Workspace attention" title="Notifications" />
    {query.isLoading && <LoadingState className="rounded-xl border bg-card p-8 text-center" label="Loading notifications…" />}
    {query.isError && <ErrorState onRetry={() => void query.refetch()} title="Notifications unavailable">{query.error.message}</ErrorState>}
    {query.data && query.data.length === 0 && <EmptyState description="Important deterministic workspace events will appear here." icon={Bell} title="You’re all caught up" />}
    {query.data && query.data.length > 0 && <div className="space-y-3">{query.data.map((item) => { const target = action(item); return <article className={`rounded-xl border p-4 ${item.readAt ? "border-border bg-card" : "border-primary/30 bg-primary/5"}`} key={item.id}><div className="flex gap-3">{icon(item)}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{item.message}</p></div>{!item.readAt && <Badge variant="primary">Unread</Badge>}</div><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>{time(item.createdAt)}</span>{target && <Link className="font-medium text-primary hover:underline" to={target}>{item.entityType === "invitation" ? "Review invitation" : item.entityType === "opportunity" ? "Review opportunity" : "Open inventory"}</Link>}{!item.readAt && <Button disabled={mutations.markRead.isPending} onClick={() => mutations.markRead.mutate(item.id)} size="sm" variant="outline">Mark as read</Button>}</div></div></div></article> })}</div>}
  </section>
}
