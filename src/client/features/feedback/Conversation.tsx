import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ImageIcon, MessageSquareOff, SendHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import type { Message, TicketStatus } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../../components/Dialog'
import { PageState } from '../../components/PageState'
import { Problem } from '../../components/Problem'
import { useDateFormatting } from '../../dates'
import { SOURCE } from '../../projectLinks'
import { readTicketMessage, ticketSubject } from '../../../contracts/feedback'
import { FEEDBACK_MESSAGE_MAX_LENGTH } from './feedback'
import { refreshSupport, replyToConversation, useSupportAvailable } from './support'
import { supportMessagesQuery } from '../../queries'
import { StatusChip } from './YourFeedback'
import { searchShortcutModifier } from '../shell/globalSearchShortcut'

/** Messages by one author this close together read as one turn, under a single name. */
const TURN_MS = 5 * 60_000
/** How far this device's clock may differ from Support's. */
const CLOCK_SKEW_MS = 5 * 60_000
/** How close to the newest message the player must be for an arriving one to scroll into view. */
const FOLLOW_PX = 160

/** One feedback conversation in the support panel: the player's messages, the team's public replies, and a reply box. */
export function Conversation({ ticketId, notice, onBack }: { ticketId: string; notice?: string; onBack: () => void }) {
  const available = useSupportAvailable()
  const dates = useDateFormatting()
  const { data, error, isPending } = useQuery(supportMessagesQuery(ticketId, Boolean(available)))
  const first = data?.messages[0]
  const kind = first ? readTicketMessage(first.content).kind : undefined

  return (
    <>
      <DialogHeader className="flex flex-row items-start gap-2 pl-2">
        <Button variant="ghost" size="icon-sm" className="mt-0.5 shrink-0" aria-label="All conversations" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 space-y-1.5">
          <DialogTitle className="line-clamp-2 leading-snug">{(first && ticketSubject(first.content)) || 'Conversation'}</DialogTitle>
          <DialogDescription render={<div />} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
            {data?.status && first ? (
              <>
                <StatusChip status={data.status} />
                {kind ? <span className="chip">{kind}</span> : null}
                <span>Started {dates.date(first.created_at)}</span>
              </>
            ) : (
              'Your feedback and our replies'
            )}
          </DialogDescription>
        </div>
      </DialogHeader>
      {available === false ? (
        <DialogBody>
          <PageState
            headingLevel={2}
            title="Feedback is unavailable here"
            explanation="This browser may be blocking analytics, which also carries feedback. You can report a problem on GitHub instead."
            action={
              <a href={`${SOURCE}/issues/new`} target="_blank" rel="noreferrer" className="text-info underline hover:text-parchment">
                Report it on GitHub
              </a>
            }
          />
        </DialogBody>
      ) : error ? (
        <DialogBody>
          <Problem error={error} />
        </DialogBody>
      ) : available === undefined || isPending ? (
        <DialogBody>
          <ThreadSkeleton />
        </DialogBody>
      ) : !data.messages.length ? (
        <DialogBody>
          <PageState
            headingLevel={2}
            icon={MessageSquareOff}
            title="Conversation not found"
            explanation="It may have been started in another browser. Sign in to see feedback you sent while signed in on any device."
          />
        </DialogBody>
      ) : (
        <Thread ticketId={ticketId} messages={data.messages} status={data.status} notice={notice} />
      )}
    </>
  )
}

function Thread({ ticketId, messages, status, notice }: { ticketId: string; messages: Message[]; status?: TicketStatus; notice?: string }) {
  const dates = useDateFormatting()
  const queryClient = useQueryClient()
  const [reply, setReply] = useState('')
  const send = useMutation({
    mutationFn: ({ text }: { text: string; at: string }) => replyToConversation(ticketId, text),
    onSuccess: () => {
      setReply('')
      return refreshSupport(queryClient)
    },
  })
  const nearLimit = reply.length > FEEDBACK_MESSAGE_MAX_LENGTH * 0.8
  const submit = () => {
    const text = reply.trim()
    if (text && !send.isPending) send.mutate({ text, at: new Date().toISOString() })
  }
  const pending: Message | undefined =
    send.isPending && send.variables
      ? { id: 'pending', content: send.variables.text, author_type: 'customer', created_at: send.variables.at, is_private: false }
      : undefined
  // The reply stays pending until the thread has been reread, which by then already holds it as sent. Only a message
  // from around the time of sending counts, allowing for this device's clock, so an earlier identical one does not.
  const delivered =
    pending &&
    messages.some(
      (message) =>
        message.author_type === 'customer' &&
        message.content === pending.content &&
        Date.parse(message.created_at) > Date.parse(pending.created_at) - CLOCK_SKEW_MS,
    )
  const shown = pending && !delivered ? [...messages, pending] : messages
  const sameDay = (a: Message, b: Message) => dates.date(a.created_at) === dates.date(b.created_at)
  const oneTurn = (a: Message | undefined, b: Message | undefined) =>
    Boolean(
      a &&
      b &&
      sameDay(a, b) &&
      a.author_type === b.author_type &&
      a.author_name === b.author_name &&
      Date.parse(b.created_at) - Date.parse(a.created_at) < TURN_MS,
    )

  const scroller = useRef<HTMLDivElement>(null)
  const seen = useRef(0)
  // The thread opens at its newest message and follows new ones, unless the player has scrolled back to read.
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const first = seen.current === 0
    const following = box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_PX
    if (first || (shown.length > seen.current && following)) box.scrollTo({ top: box.scrollHeight, behavior: first ? 'instant' : 'smooth' })
    seen.current = shown.length
  }, [shown.length])

  return (
    <section aria-label="Conversation" className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {notice ? (
          <output className="mt-4 block border border-achieved/40 bg-achieved/10 px-3 py-2 text-sm text-achieved">{notice}</output>
        ) : null}
        <ol role="log" aria-label="Messages" className="space-y-1">
          {shown.map((message, index) => {
            const previous = shown[index - 1]
            return (
              <li key={message.id}>
                {!previous || !sameDay(previous, message) ? <DayDivider at={message.created_at} /> : null}
                <Bubble
                  message={message}
                  opening={index === 0}
                  continued={oneTurn(previous, message)}
                  ends={!oneTurn(message, shown[index + 1])}
                  sending={message === pending}
                />
              </li>
            )
          })}
        </ol>
      </div>

      <div className="shrink-0 space-y-2 border-t border-edge bg-sunken px-4 py-3">
        {status === 'resolved' ? (
          <p className="flex items-center gap-2 text-xs text-dim">
            <CheckCircle2 className="size-3.5 text-achieved" aria-hidden /> We marked this resolved. Reply to reopen it.
          </p>
        ) : null}
        {send.error ? <Problem error={send.error} /> : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label htmlFor="feedback-reply" className="sr-only">
            {status === 'resolved' ? 'Reply to reopen' : 'Reply'}
          </label>
          <Textarea
            id="feedback-reply"
            required
            rows={1}
            placeholder={status === 'resolved' ? 'Reply to reopen…' : 'Write a reply…'}
            maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                submit()
              }
            }}
            className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-panel"
          />
          <Button type="submit" className="h-11 shrink-0 max-sm:w-11 max-sm:px-0" disabled={send.isPending || !reply.trim()}>
            <SendHorizontal />
            <span className="max-sm:sr-only">Send reply</span>
          </Button>
        </form>
        <p className={cn('flex items-center gap-3 text-2xs text-faint', !nearLimit && 'max-sm:hidden')}>
          <span className="max-sm:hidden">
            <Kbd className="h-4 rounded-sm bg-raised text-2xs text-dim">{searchShortcutModifier(navigator.userAgent)}</Kbd>{' '}
            <Kbd className="h-4 rounded-sm bg-raised text-2xs text-dim">Enter</Kbd> to send
          </span>
          {nearLimit ? (
            <span className="readout ml-auto text-discarded">
              {reply.length} / {FEEDBACK_MESSAGE_MAX_LENGTH}
            </span>
          ) : null}
        </p>
      </div>
    </section>
  )
}

function DayDivider({ at }: { at: string }) {
  const dates = useDateFormatting()
  return (
    <p className="flex items-center gap-3 py-3 text-2xs font-semibold tracking-eyebrow text-faint uppercase">
      <span className="h-px flex-1 bg-edge" aria-hidden />
      {dates.date(at)}
      <span className="h-px flex-1 bg-edge" aria-hidden />
    </p>
  )
}

function Bubble({
  message,
  opening,
  continued,
  ends,
  sending,
}: {
  message: Message
  opening: boolean
  continued: boolean
  /** The last message of its turn carries the turn's time; earlier ones keep theirs for screen readers only. */
  ends: boolean
  sending: boolean
}) {
  const dates = useDateFormatting()
  const mine = message.author_type === 'customer'
  const read = opening && mine ? readTicketMessage(message.content) : undefined
  return (
    <div className={cn('flex gap-2.5', mine ? 'justify-end' : 'justify-start', !continued && 'pt-3')}>
      {!mine ? (
        <span className="w-7 shrink-0">
          {continued ? null : <img src="/logo.svg" alt="" aria-hidden className="size-7 rounded-full border border-edge bg-sunken p-1" />}
        </span>
      ) : null}
      <div className={cn('flex max-w-[85%] flex-col', mine ? 'items-end' : 'items-start')}>
        {continued ? null : (
          <p className="mb-1 flex items-baseline gap-2 text-xs">
            <span className="font-semibold text-bone">{mine ? 'You' : (message.author_name ?? 'Praetorium')}</span>
            {mine ? null : <span className="text-faint">Praetorium team</span>}
          </p>
        )}
        <div
          className={cn(
            'border px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
            mine ? 'border-edge-strong bg-raised text-bone' : 'border-info/35 bg-panel text-bone',
            sending && 'opacity-60',
          )}
        >
          {read ? read.body : mine ? message.content : <TeamMessage content={message.content} />}
          {read && (read.version || read.screenshot) ? (
            <span className="mt-2 flex flex-wrap gap-1.5 border-t border-edge pt-2 whitespace-normal">
              {read.version ? <span className="chip">Version {read.version}</span> : null}
              {read.screenshot ? (
                <span className="chip gap-1">
                  <ImageIcon className="size-3" aria-hidden /> Screenshot attached
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <p className={cn('readout mt-1 text-2xs text-faint', !ends && !sending && 'sr-only')}>
          {sending ? 'Sending…' : dates.time(message.created_at)}
        </p>
      </div>
    </div>
  )
}

/** The team writes replies in markdown, so a pasted image or link shows as one rather than as its syntax. */
const TEAM_MARKDOWN: Components = {
  p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-info underline underline-offset-2 hover:text-bone">
      {children}
    </a>
  ),
  img: ({ src, alt }) =>
    typeof src === 'string' ? (
      <a href={src} target="_blank" rel="noreferrer" className="block">
        <img src={src} alt={alt ?? ''} loading="lazy" className="max-h-80 max-w-full border border-edge" />
      </a>
    ) : null,
  ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
}

function TeamMessage({ content }: { content: string }) {
  return (
    <span className="block space-y-2 whitespace-normal">
      <Markdown components={TEAM_MARKDOWN}>{content}</Markdown>
    </span>
  )
}

function ThreadSkeleton() {
  return (
    <output aria-label="Loading the conversation" className="block space-y-4">
      <Skeleton className="ml-auto h-20 w-[min(30rem,80%)] rounded-none bg-raised" />
      <div className="flex gap-2.5">
        <Skeleton className="size-7 rounded-full bg-raised" />
        <Skeleton className="h-14 w-[min(26rem,70%)] rounded-none bg-raised" />
      </div>
      <Skeleton className="h-32 w-full rounded-none bg-raised" />
    </output>
  )
}
