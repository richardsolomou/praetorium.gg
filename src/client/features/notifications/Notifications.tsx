import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { formatAgo } from '../../dates'
import { markNoticesRead } from '../../functions'
import { syncNativeNotices } from '../../nativeBridge'
import { NOTICE_ID } from '../../../core/notificationConfig'
import { type QueryData, noticesQuery } from '../../queries'
import { countLabel } from '../../text'
import { useHydrated } from '../../useClientValue'

type Notices = QueryData<typeof noticesQuery>

export function useUnreadNotices(enabled = true) {
  const { data } = useQuery({ ...noticesQuery(), enabled })
  return data?.filter((notice) => !notice.read).length ?? 0
}

/** A notice's page as a router link, whose search the router reads apart from the path. */
function linkTo(path: string) {
  const url = new URL(path, 'https://praetorium.gg')
  return { to: url.pathname, search: Object.fromEntries(url.searchParams) }
}

/** Marks notices read at once on this device; the module's signal then refreshes every other one. */
function useMarkRead() {
  const queryClient = useQueryClient()
  const { queryKey } = noticesQuery()
  return useMutation({
    mutationFn: (ids: string[]) => markNoticesRead({ data: { ids } }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey })
      const read = new Set(ids)
      queryClient.setQueryData<Notices>(queryKey, (notices) =>
        notices?.map((notice) => (read.has(notice.id) ? { ...notice, read: true } : notice)),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

/** Every notice the player has, newest first, each linking to the page it is about. */
export function NoticeList({ onOpen }: { onOpen?: () => void }) {
  const { data: notices, isPending, isError, refetch } = useQuery(noticesQuery())
  const markRead = useMarkRead()
  const hydrated = useHydrated()
  if (isPending) return <p className="px-3 py-6 text-center text-sm text-dim">Loading notifications…</p>
  if (isError)
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-dim">
        <p>Your notifications didn’t load.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    )
  if (!notices.length)
    return (
      <div className="px-3 py-6 text-center text-sm text-dim">
        <p className="font-semibold text-bone">Nothing new</p>
        <p className="mt-1 text-balance">Friend requests, new battles, and news from your groups and tournaments show up here.</p>
      </div>
    )
  return (
    <ul data-notice-list className="divide-y divide-edge">
      {notices.map((notice) => (
        <li key={notice.id}>
          <Link
            {...linkTo(notice.path)}
            data-notice={notice.read ? 'read' : 'unread'}
            // Capture, because a link into another phone tab is taken over before the router's own click handler runs.
            onClickCapture={() => {
              if (!notice.read) markRead.mutate([notice.id])
              onOpen?.()
            }}
            className="flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-raised focus-visible:bg-raised"
          >
            <span
              aria-hidden
              className={`mt-1.5 size-2 shrink-0 rounded-full ${notice.read ? 'border border-runner-hi' : 'bg-parchment'}`}
            />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-semibold ${notice.read ? 'text-dim' : 'text-bone'}`}>
                {notice.read ? null : <span className="sr-only">Unread: </span>}
                {notice.title}
              </span>
              <span className={`block text-sm leading-snug text-pretty ${notice.read ? 'text-faint' : 'text-dim'}`}>{notice.body}</span>
              {/* Relative time depends on the clock, so it waits for the browser rather than mismatch the server's frame. */}
              {hydrated ? <span className="mt-0.5 block text-xs text-faint">{formatAgo(notice.at)}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Marks read the notice a push opened, which its page carries as `notice`, and keeps the app's delivered pushes and
 * icon badge in step with the list, so reading a notice on any device clears it from the phone.
 */
export function NoticeSync() {
  const { data: notices } = useQuery(noticesQuery())
  const markRead = useMarkRead()
  const opened = useRouterState({ select: (state) => (state.location.search as Record<string, unknown>).notice })
  const marked = useRef(new Set<string>())
  useEffect(() => {
    const id = typeof opened === 'number' || typeof opened === 'string' ? String(opened) : null
    if (!id || !NOTICE_ID.test(id) || marked.current.has(id)) return
    marked.current.add(id)
    markRead.mutate([id])
  }, [opened, markRead])
  useEffect(() => {
    if (notices)
      syncNativeNotices(
        notices.filter((notice) => notice.read).map((notice) => notice.id),
        notices.filter((notice) => !notice.read).length,
      )
  }, [notices])
  return null
}

export function MarkAllRead() {
  const { data: notices } = useQuery(noticesQuery())
  const markRead = useMarkRead()
  const unread = notices?.filter((notice) => !notice.read).map((notice) => notice.id) ?? []
  if (!unread.length) return null
  return (
    <Button variant="ghost" size="xs" className="text-dim hover:text-bone" onClick={() => markRead.mutate(unread)}>
      Mark all read
    </Button>
  )
}

/** The bell beside the account control, with the unread count, opening the player's notices. */
export function NotificationsButton({
  beside,
  className = '',
}: {
  /** Opens the panel beside this element, such as the desktop rail, rather than below the bell. */
  beside?: RefObject<HTMLElement | null>
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const unread = useUnreadNotices()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            data-notifications-button
            className={`shrink-0 text-dim hover:bg-raised hover:text-bone ${className}`}
            aria-label={unread ? `Notifications, ${countLabel(unread, 'unread notification')}` : 'Notifications'}
          />
        }
      >
        <span className="relative flex">
          <Bell aria-hidden className="size-4.5" />
          {unread ? (
            <span
              aria-hidden
              data-unread-notices
              className="absolute -top-2 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-void bg-parchment px-0.5 font-mono text-3xs leading-none font-bold text-parchment-ink tabular-nums box-content"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side={beside ? 'right' : 'bottom'}
        align="end"
        anchor={beside}
        sideOffset={beside ? 8 : 6}
        className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-edge py-2 pr-2 pl-3">
          <PopoverTitle className="font-display text-sm font-bold tracking-tight text-bone uppercase">Notifications</PopoverTitle>
          <MarkAllRead />
        </div>
        <div className="max-h-[min(28rem,65dvh)] overflow-y-auto overscroll-contain">
          <NoticeList onOpen={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
