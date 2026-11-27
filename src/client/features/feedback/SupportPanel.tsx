import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { posthog } from 'posthog-js'
import { lazy, type Ref, Suspense, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { PageState } from '../../components/PageState'
import { Problem } from '../../components/Problem'
import { FeedbackForm } from './FeedbackForm'
import { type FeedbackDraft, type SupportView, unreadReplies, useSupportTickets } from './support'
import { TicketList } from './YourFeedback'
import { countLabel } from '../../text'
import { useCompactChrome } from '../shell/useCompactChrome'

// A conversation's Markdown loads only when one opens.
const Conversation = lazy(() => import('./Conversation').then((module) => ({ default: module.Conversation })))

/** Conversations shown under the message box; the rest are a tap away. */
const LATEST = 3

type Shown = SupportView | { kind: 'sent'; ticketId: string; screenshotLost: boolean; signedOutEmail: boolean }

/**
 * Support over whichever page the player is on: a new message first, their latest conversations beneath it, and each
 * conversation. Wide screens dock it to the right edge; compact screens give it the whole screen, as every dialog there.
 */
export function SupportPanel({ request }: { request: { view: SupportView } }) {
  const [previousRequest, setPreviousRequest] = useState(request)
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<Shown>(request.view)

  useEffect(() => {
    if (request.view.kind === 'home') posthog.capture('feedback_opened', { from: request.view.draft?.from ?? null })
  }, [request])
  if (request !== previousRequest) {
    setPreviousRequest(request)
    setView(request.view)
    setOpen(true)
  }
  const home = () => setView({ kind: 'home' })
  const message = useRef<HTMLTextAreaElement>(null)
  const compact = useCompactChrome()

  return (
    // Beside the website's page it is not modal, and using the page leaves a started message in place.
    <Dialog
      open={open}
      modal={compact}
      onOpenChange={(next, { reason }) => {
        if (next || compact || (reason !== 'outside-press' && reason !== 'focus-out')) setOpen(next)
      }}
    >
      <DialogContent
        data-support-panel
        initialFocus={() => message.current ?? true}
        className="min-[860px]:top-0 min-[860px]:right-0 min-[860px]:left-auto min-[860px]:h-dvh sm:max-h-none min-[860px]:w-[28rem] min-[860px]:shadow-none min-[860px]:translate-none min-[860px]:rounded-none min-[860px]:border-l min-[860px]:border-edge sm:max-w-none min-[860px]:data-open:zoom-in-100 min-[860px]:data-open:slide-in-from-right-8"
      >
        {view.kind === 'thread' ? (
          <Suspense fallback={<PageState headingLevel={2} loading title="Loading the conversation" explanation="Finding its messages." />}>
            <Conversation key={view.ticketId} ticketId={view.ticketId} onBack={home} />
          </Suspense>
        ) : view.kind === 'sent' ? (
          <Sent {...view} onOpen={() => setView({ kind: 'thread', ticketId: view.ticketId })} onDone={() => setOpen(false)} />
        ) : view.kind === 'inbox' ? (
          <AllConversations onBack={home} onOpen={(ticketId) => setView({ kind: 'thread', ticketId })} />
        ) : (
          <Home
            draft={view.draft}
            messageRef={message}
            onOpen={(ticketId) => setView({ kind: 'thread', ticketId })}
            onAll={() => setView({ kind: 'inbox' })}
            onSent={(sent) => setView({ kind: 'sent', ...sent })}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Home({
  draft,
  messageRef,
  onOpen,
  onAll,
  onSent,
}: {
  draft?: FeedbackDraft
  messageRef: Ref<HTMLTextAreaElement>
  onOpen: (ticketId: string) => void
  onAll: () => void
  onSent: (sent: { ticketId: string; screenshotLost: boolean; signedOutEmail: boolean }) => void
}) {
  const { tickets, count } = useSupportTickets()
  const unread = unreadReplies(tickets)
  // Replies the player has not read come first, since they are why most people come back.
  const latest = tickets?.toSorted((a, b) => Number(Boolean(b.unread_count)) - Number(Boolean(a.unread_count))).slice(0, LATEST)
  const total = count ?? tickets?.length ?? 0
  return (
    <>
      <DialogHeader className="space-y-1.5">
        <DialogTitle>{draft?.record ? 'Report a data problem' : draft?.about ? 'Report a problem' : 'Feedback'}</DialogTitle>
        <DialogDescription>We read every message and reply in this panel.</DialogDescription>
      </DialogHeader>
      <FeedbackForm draft={draft} messageRef={messageRef} onSent={onSent}>
        {latest?.length ? (
          <section aria-labelledby="latest-conversations" className="-mx-4 mt-2 border-t border-edge pt-4">
            <h3 id="latest-conversations" className="eyebrow mx-4 mb-1 flex items-baseline gap-2">
              <span>Your conversations</span>
              {unread ? <span className="text-discarded">{countLabel(unread, 'new reply', 'new replies')}</span> : null}
            </h3>
            <TicketList tickets={latest} loadingMore={false} onOpen={onOpen} />
            {total > LATEST ? (
              <Button variant="link" size="sm" className="mx-4 px-0 text-info" onClick={onAll}>
                All {total} conversations
              </Button>
            ) : null}
          </section>
        ) : null}
      </FeedbackForm>
    </>
  )
}

function Sent({
  screenshotLost,
  signedOutEmail,
  onOpen,
  onDone,
}: {
  screenshotLost: boolean
  signedOutEmail: boolean
  onOpen: () => void
  onDone: () => void
}) {
  return (
    <>
      <DialogBody className="content-center justify-items-center gap-3 py-12 text-center">
        <CheckCircle2 aria-hidden className="size-10 text-achieved" />
        <DialogTitle>Thanks, it’s sent</DialogTitle>
        <DialogDescription className="max-w-xs text-balance">
          We read every message. Our reply will appear here and under Your conversations on the Support page
          {signedOutEmail ? ', and we will email you' : ''}.
        </DialogDescription>
        {screenshotLost ? <Problem className="max-w-xs">The screenshot could not be attached, but your message was sent.</Problem> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onOpen}>
          View conversation
        </Button>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  )
}

function AllConversations({ onBack, onOpen }: { onBack: () => void; onOpen: (ticketId: string) => void }) {
  const { tickets, count, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useSupportTickets()
  const unread = unreadReplies(tickets)
  return (
    <>
      <DialogHeader className="flex flex-row items-start gap-2 pl-2">
        <Button variant="ghost" size="icon-sm" className="mt-0.5 shrink-0" aria-label="Back to feedback" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="space-y-1.5">
          <DialogTitle>Your conversations</DialogTitle>
          <DialogDescription>
            {countLabel(count ?? tickets?.length ?? 0, 'conversation')}
            {unread ? `, ${countLabel(unread, 'new reply', 'new replies')}` : ''}
          </DialogDescription>
        </div>
      </DialogHeader>
      {error ? (
        <DialogBody>
          <Problem error={error} />
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
