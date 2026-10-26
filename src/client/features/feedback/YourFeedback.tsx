import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Ticket } from 'posthog-js'
import { cn } from '@/lib/utils'
import { useVirtualRows } from '../../components/useVirtualRows'
import { Problem } from '../../components/Problem'
import { formatAgo } from '../../dates'
import { messagePreview, ticketSubject } from '../../../contracts/feedback'
import { openConversation, TICKET_STATUS, unreadReplies, useSupportTickets } from './support'
import { openingMessageQuery } from '../../queries'
import { countLabel } from '../../text'

/** The player's feedback conversations, newest activity first; hidden until they have one. */
export function YourFeedback() {
  const { tickets, count, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useSupportTickets()
  if (!tickets?.length) return null
  const unread = unreadReplies(tickets)

  return (
    <section aria-labelledby="your-conversations">
      <h2 id="your-conversations" className="rubric flex items-baseline gap-3 border-b border-edge pb-2">
        <span>Your conversations</span>
        {unread ? <span className="text-discarded">{unread} new</span> : null}
        <span className="readout ml-auto">{count ?? tickets.length}</span>
      </h2>
      {error ? <Problem error={error} /> : null}
      <TicketList
        tickets={tickets}
        loadMore={hasNextPage && !isFetchingNextPage ? () => void fetchNextPage() : undefined}
        loadingMore={isFetchingNextPage}
        onOpen={openConversation}
        className="max-h-[min(70vh,34rem)] border-b border-edge"
      />
    </section>
  )
}

/** The player's conversations, newest activity first, drawn only as far as they scroll. */
export function TicketList({
  tickets,
  loadMore,
  loadingMore,
  onOpen,
  className,
}: {
  tickets: Ticket[]
  loadMore?: () => void
  loadingMore: boolean
  onOpen: (ticketId: string) => void
  className?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const { items, totalSize, virtualizer } = useVirtualRows({
    count: tickets.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 92,
    getItemKey: (index) => tickets[index]!.id,
    initialRect: { width: 640, height: 480 },
    overscan: 4,
  })
  const last = items.at(-1)?.index
  // The next page loads as the list nears its end, so scrolling never stops at a page boundary.
  useEffect(() => {
    if (last !== undefined && last >= tickets.length - 3) loadMore?.()
  }, [last, loadMore, tickets.length])

  return (
    <div ref={scroller} className={cn('overflow-y-auto overscroll-contain', className)}>
      <nav aria-label="Conversations" className="relative w-full" style={{ height: totalSize }}>
        {items.map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full border-b border-edge last:border-b-0"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <TicketRow ticket={tickets[item.index]!} onOpen={onOpen} />
          </div>
        ))}
      </nav>
      {loadingMore ? <p className="py-3 text-center text-xs text-dim">Loading older conversations…</p> : null}
    </div>
  )
}

function TicketRow({ ticket, onOpen }: { ticket: Ticket; onOpen: (ticketId: string) => void }) {
  const { data: opening } = useQuery(openingMessageQuery(ticket.id))
  const unread = ticket.unread_count ?? 0
  const at = ticket.last_message_at ?? ticket.created_at
  const latest = ticket.last_message ? messagePreview(ticket.last_message) : ''
  const subject = opening ? ticketSubject(opening) : undefined
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket.id)}
      className="group flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-raised focus-visible:bg-raised focus-visible:-outline-offset-2"
    >
      <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-discarded' : 'bg-transparent')} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className={cn('min-w-0 flex-1 line-clamp-2 text-sm', unread ? 'font-bold text-bone' : 'font-semibold text-bone/85')}>
            {subject ??
              (opening === undefined ? <span className="inline-block h-3.5 w-48 animate-pulse bg-raised align-middle" /> : latest)}
          </span>
          <span className="readout shrink-0 text-xs text-faint">{formatAgo(at)}</span>
        </span>
        {subject && latest && latest !== subject ? <span className="mt-0.5 block truncate text-sm text-dim">{latest}</span> : null}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
          <StatusChip status={ticket.status} />
          {unread ? (
            <span className="chip border-discarded/60 bg-discarded/10 text-discarded">
              {countLabel(unread, 'new reply', 'new replies')}
            </span>
          ) : null}
          <span className="readout">{countLabel(ticket.message_count, 'message')}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 self-center text-info group-hover:text-parchment" aria-hidden />
    </button>
  )
}

/** A conversation's state in the player's terms; only a resolved one carries colour, as a finished outcome. */
export function StatusChip({ status }: { status: Ticket['status'] }) {
  return (
    <span
      className={cn(
        'chip',
        status === 'resolved' && 'border-achieved/60 text-achieved',
        status === 'pending' && 'border-info/60 text-info',
      )}
    >
      {TICKET_STATUS[status]}
    </span>
  )
}
