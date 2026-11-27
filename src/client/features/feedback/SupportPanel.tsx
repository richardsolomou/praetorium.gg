import { ArrowLeft, CheckCircle2, ChevronRight } from 'lucide-react'
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

// A conversation's Markdown loads only when one opens.
const Conversation = lazy(() => import('./Conversation').then((module) => ({ default: module.Conversation })))

type Shown = SupportView | { kind: 'sent'; ticketId: string; screenshotLost: boolean; signedOutEmail: boolean }

/**
 * Support over whichever page the player is on: a new message, the player's conversations, and each conversation.
 */
export function SupportPanel({ request }: { request: { view: SupportView } }) {
  const [previousRequest, setPreviousRequest] = useState(request)
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<Shown>(request.view)
  const [draft, setDraft] = useState(request.view.kind === 'home' ? request.view.draft : undefined)
  // A new form for each request and after each message.
  const [form, setForm] = useState(0)

  useEffect(() => {
    if (request.view.kind === 'home') posthog.capture('feedback_opened', { from: request.view.draft?.from ?? null })
  }, [request])
  if (request !== previousRequest) {
    setPreviousRequest(request)
    setView(request.view)
    setDraft(request.view.kind === 'home' ? request.view.draft : undefined)
    setForm(form + 1)
    setOpen(true)
  }
  const inbox = () => setView({ kind: 'inbox' })
  const message = useRef<HTMLTextAreaElement>(null)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* One height for every view, so moving between them or writing a long reply never resizes the dialog. */}
      <DialogContent initialFocus={() => message.current ?? true} className="sm:h-[min(46rem,calc(100dvh-4rem))]">
        {view.kind === 'thread' ? (
          <Suspense
            fallback={
              <PageState headingLevel={2} loading title="Loading the conversation" explanation="Finding its messages." className="flex-1" />
            }
          >
            <Conversation key={view.ticketId} ticketId={view.ticketId} onBack={inbox} />
          </Suspense>
        ) : view.kind === 'sent' ? (
          <Sent {...view} onOpen={() => setView({ kind: 'thread', ticketId: view.ticketId })} onDone={() => setOpen(false)} />
        ) : view.kind === 'inbox' ? (
          <AllConversations onBack={() => setView({ kind: 'home' })} onOpen={(ticketId) => setView({ kind: 'thread', ticketId })} />
        ) : null}
        <Home
          key={form}
          shown={view.kind === 'home'}
          draft={draft}
          messageRef={message}
          onOpen={(ticketId) => setView({ kind: 'thread', ticketId })}
          onAll={inbox}
          onSent={(sent) => {
            setView({ kind: 'sent', ...sent })
            setDraft(undefined)
            setForm(form + 1)
          }}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function Home({
  shown,
  draft,
  messageRef,
  onOpen,
  onAll,
  onSent,
  onCancel,
}: {
  /** Hidden rather than unmounted while the player reads their conversations, so a message being written stays. */
  shown: boolean
  draft?: FeedbackDraft
  messageRef: Ref<HTMLTextAreaElement>
  onOpen: (ticketId: string) => void
  onAll: () => void
  onSent: (sent: { ticketId: string; screenshotLost: boolean; signedOutEmail: boolean }) => void
  onCancel: () => void
}) {
  const { tickets } = useSupportTickets()
  const unread = unreadReplies(tickets)
  const waiting = tickets?.filter((ticket) => ticket.unread_count) ?? []
  return (
    <div className={shown ? 'contents' : 'hidden'}>
      {shown ? (
        <DialogHeader className="space-y-1.5">
          <DialogTitle>{draft?.record ? 'Report a data problem' : draft?.about ? 'Report a problem' : 'Send feedback'}</DialogTitle>
          <DialogDescription>
            We read every message and reply here.
            {tickets?.length ? (
              <>
                {' '}
                <button type="button" className="text-info underline underline-offset-2 hover:text-parchment" onClick={onAll}>
                  Your conversations
                </button>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
      ) : null}
      {shown && unread ? (
        <button
          type="button"
          onClick={() => (waiting.length === 1 ? onOpen(waiting[0]!.id) : onAll())}
          className="group flex shrink-0 items-center gap-3 border-b border-edge px-4 py-3 text-left text-sm hover:bg-raised focus-visible:-outline-offset-2"
        >
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-discarded" />
          <span className="min-w-0 flex-1 font-semibold text-bone">We replied: {countLabel(unread, 'new reply', 'new replies')}</span>
          <span className="text-info group-hover:text-parchment">Read</span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-info group-hover:text-parchment" />
        </button>
      ) : null}
      <FeedbackForm draft={draft} messageRef={messageRef} onSent={onSent} onCancel={onCancel} shown={shown} />
    </div>
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
      <DialogBody className="content-center">
        <DialogTitle className="sr-only">Feedback sent</DialogTitle>
        <PageState
          headingLevel={2}
          icon={CheckCircle2}
          title="Thanks, it’s sent"
          explanation={`We read every message. Our reply will appear here and under Your conversations on the Support page${signedOutEmail ? ', and we will email you' : ''}.`}
        />
        {screenshotLost ? (
          <Problem className="text-center">The screenshot could not be attached, but your message was sent.</Problem>
        ) : null}
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
      <DialogFooter>
        <Button onClick={onBack}>Send new feedback</Button>
      </DialogFooter>
    </>
  )
}
