import { ArrowLeft, PenSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { PageState } from '../../components/PageState'
import { Problem } from '../../components/Problem'
import { Conversation } from './Conversation'
import { FeedbackForm } from './FeedbackForm'
import { onOpenSupport, type SupportView, unreadReplies, useSupportTickets } from './support'
import { TicketList } from './YourFeedback'
import { countLabel } from '../../text'

/**
 * Support over whichever page the player is on: their conversations, a new message, and each conversation. Wide
 * screens dock it to the right edge; compact screens give it the whole screen, as every dialog there.
 */
export function SupportPanel() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<SupportView>({ kind: 'inbox' })
  const [notice, setNotice] = useState<string>()
  const { tickets, enabled, isPending } = useSupportTickets()
  const hasTickets = Boolean(tickets?.length)
  // A player with nothing to read gets straight to writing; their list appears once they have sent something.
  const shown: SupportView = view.kind === 'inbox' && (!enabled || (!isPending && !hasTickets)) ? { kind: 'compose' } : view

  useEffect(
    () =>
      onOpenSupport((next) => {
        setNotice(undefined)
        setView(next)
        setOpen(true)
      }),
    [],
  )
  const go = (next: SupportView) => {
    setNotice(undefined)
    setView(next)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        actions={
          shown.kind === 'inbox' && hasTickets ? (
            <Button size="sm" onClick={() => go({ kind: 'compose' })}>
              <PenSquare /> New message
            </Button>
          ) : undefined
        }
        className="min-[860px]:top-0 min-[860px]:right-0 min-[860px]:left-auto min-[860px]:h-dvh sm:max-h-none min-[860px]:w-[28rem] min-[860px]:translate-none min-[860px]:rounded-none min-[860px]:border-l min-[860px]:border-edge sm:max-w-none min-[860px]:data-open:zoom-in-100 min-[860px]:data-open:slide-in-from-right-8"
      >
        {shown.kind === 'thread' ? (
          <Conversation key={shown.ticketId} ticketId={shown.ticketId} notice={notice} onBack={() => go({ kind: 'inbox' })} />
        ) : shown.kind === 'compose' ? (
          <>
            <DialogHeader className={hasTickets ? 'flex flex-row items-start gap-2 pl-2' : undefined}>
              {hasTickets ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mt-0.5 shrink-0"
                  aria-label="All conversations"
                  onClick={() => go({ kind: 'inbox' })}
                >
                  <ArrowLeft />
                </Button>
              ) : null}
              <div className="space-y-1.5">
                <DialogTitle>Send feedback</DialogTitle>
                <DialogDescription>Tell us what went wrong or what you would like.</DialogDescription>
              </div>
            </DialogHeader>
            <FeedbackForm
              onCancel={() => (hasTickets ? go({ kind: 'inbox' }) : setOpen(false))}
              onSent={(ticketId, screenshotLost) => {
                setView({ kind: 'thread', ticketId })
                setNotice(
                  screenshotLost
                    ? 'Thanks, your feedback was sent, but the screenshot could not be attached. Our reply will appear here.'
                    : 'Thanks, your feedback was sent. Our reply will appear here.',
                )
              }}
            />
          </>
        ) : (
          <Conversations onOpen={(ticketId) => go({ kind: 'thread', ticketId })} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Conversations({ onOpen }: { onOpen: (ticketId: string) => void }) {
  const { available, tickets, count, error, hasNextPage, isFetchingNextPage, fetchNextPage, enabled, isPending } = useSupportTickets()
  const unread = unreadReplies(tickets)
  return (
    <>
      <DialogHeader className="space-y-1.5">
        <DialogTitle>Your feedback</DialogTitle>
        <DialogDescription>
          {tickets?.length
            ? `${countLabel(count ?? tickets.length, 'conversation')}${unread ? `, ${countLabel(unread, 'new reply', 'new replies')}` : ''}`
            : 'Feedback you send and our replies.'}
        </DialogDescription>
      </DialogHeader>
      {error ? (
        <DialogBody>
          <Problem error={error} />
        </DialogBody>
      ) : available === undefined || (enabled && isPending) ? (
        <DialogBody>
          <PageState headingLevel={2} loading title="Loading your feedback" explanation="Finding the conversations you started." />
        </DialogBody>
      ) : (
        <TicketList
          tickets={tickets ?? []}
          loadMore={hasNextPage && !isFetchingNextPage ? () => void fetchNextPage() : undefined}
          loadingMore={isFetchingNextPage}
          onOpen={onOpen}
          className="min-h-0 flex-1"
        />
      )}
    </>
  )
}
