import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, X } from 'lucide-react'
import { posthog } from 'posthog-js'
import { type ReactNode, type Ref, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DialogBody } from '../../components/Dialog'
import { feedbackScreenshotPath, FEEDBACK_MESSAGE_MAX_LENGTH, feedbackTicketMessage, type FeedbackKind } from '../../../contracts/feedback'
import { uploadFeedbackScreenshot } from '../../functions'
import { NEW_ISSUE } from '../../projectLinks'
import { meQuery } from '../../queries'
import { prepareFeedbackScreenshot } from './screenshot'
import { type FeedbackDraft, refreshSupport, startConversation } from './support'
import { Problem } from '../../components/Problem'
import { errorMessage } from '../../queryClient'
import { searchShortcutModifier } from '../shell/globalSearchShortcut'
import { pressedClass } from '../simulator/CombatControls'

const KINDS: { kind: FeedbackKind; label: string; placeholder: string }[] = [
  { kind: 'Problem', label: 'Something’s wrong', placeholder: 'What happened, and what did you expect?' },
  { kind: 'Idea', label: 'An idea', placeholder: 'What would you like Praetorium to do?' },
  { kind: 'Other', label: 'Something else', placeholder: 'Anything at all: praise, a question, a rule you miss…' },
]

/** A new conversation, sent from the page the player is on so its session replay shows what they were looking at. */
export function FeedbackForm({
  draft,
  messageRef,
  onSent,
  children,
}: {
  draft?: FeedbackDraft
  /** The message box, which the panel focuses as it opens. */
  messageRef?: Ref<HTMLTextAreaElement>
  onSent: (sent: { ticketId: string; screenshotLost: boolean; signedOutEmail: boolean }) => void
  /** Shown beneath the message, inside the same scrolling body. */
  children?: ReactNode
}) {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<FeedbackKind | undefined>(draft?.kind)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [screenshot, setScreenshot] = useState<string>()
  const [screenshotError, setScreenshotError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<'unavailable' | { error: string }>()

  const attach = useCallback((file: File | null | undefined) => {
    if (!file) return
    setScreenshotError(undefined)
    prepareFeedbackScreenshot(file).then(setScreenshot, (error: unknown) =>
      setScreenshotError(errorMessage(error, 'That screenshot could not be attached.')),
    )
  }, [])
  useEffect(() => {
    const pasted = (event: ClipboardEvent) => {
      const image = [...(event.clipboardData?.files ?? [])].find((file) => file.type.startsWith('image/'))
      if (!image) return
      event.preventDefault()
      attach(image)
    }
    // Also stops a dropped file opening in place of the page.
    const dragged = (event: DragEvent) => event.preventDefault()
    const dropped = (event: DragEvent) => {
      event.preventDefault()
      attach(event.dataTransfer?.files[0])
    }
    window.addEventListener('paste', pasted)
    window.addEventListener('dragover', dragged)
    window.addEventListener('drop', dropped)
    return () => {
      window.removeEventListener('paste', pasted)
      window.removeEventListener('dragover', dragged)
      window.removeEventListener('drop', dropped)
    }
  }, [attach])

  const send = async () => {
    if (sending || !message.trim()) return
    setSending(true)
    setFailure(undefined)
    try {
      // The text matters more than the picture, so a failed upload still sends the feedback.
      const file = screenshot ? await uploadFeedbackScreenshot({ data: { image: screenshot } }).catch(() => undefined) : undefined
      const replyTo = me ? undefined : email.trim() || undefined
      const sent = await startConversation(
        feedbackTicketMessage({
          kind: kind ?? 'Other',
          message,
          screenshotUrl: file ? new URL(feedbackScreenshotPath(file), window.location.origin).href : undefined,
          record: draft?.record,
          about: draft?.about,
        }),
        replyTo,
      )
      if (!sent) return setFailure('unavailable')
      posthog.capture('feedback_sent', { from: draft?.from ?? null, kind: kind ?? null, screenshot: Boolean(file) })
      if (draft?.record) posthog.capture('data_problem_reported', { from: draft.record.from })
      void refreshSupport(queryClient)
      onSent({ ticketId: sent.ticket_id, screenshotLost: Boolean(screenshot && !file), signedOutEmail: Boolean(replyTo) })
    } catch (error) {
      setFailure({ error: errorMessage(error, 'Your feedback could not be sent. Try again.') })
    } finally {
      setSending(false)
    }
  }

  const context = draft?.record ? `${draft.record.name} · ${draft.record.faction} · ${draft.record.rulesVersion}` : draft?.about
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <DialogBody className="gap-3">
        <Label className="text-base font-semibold text-bone" htmlFor="feedback-message">
          {draft?.question ?? 'What’s on your mind?'}
        </Label>
        {context ? (
          <p className="border-l-2 border-edge pl-3 text-xs text-dim">
            <span className="block text-bone">{context}</span>
            We send this with your message.
          </p>
        ) : null}
        <ToggleGroup
          aria-label="Kind of feedback"
          variant="outline"
          size="sm"
          className="flex-wrap"
          value={kind ? [kind] : []}
          onValueChange={(value) => setKind(KINDS.find((option) => option.kind === value[0])?.kind)}
        >
          {KINDS.map((option) => (
            <ToggleGroupItem key={option.kind} value={option.kind} className={`${pressedClass} px-2.5 text-sm max-sm:min-h-11`}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Textarea
          id="feedback-message"
          ref={messageRef}
          required
          rows={5}
          maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
          placeholder={KINDS.find((option) => option.kind === kind)?.placeholder ?? 'A problem, an idea, a rule you miss, anything…'}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void send()
            }
          }}
          className="min-h-32"
        />
        {screenshot ? (
          <div className="flex items-start gap-2">
            <img src={screenshot} alt="Attached screenshot" className="ph-no-capture max-h-24 min-w-0 border border-edge object-contain" />
            <Button
              variant="ghost"
              size="icon"
              className="size-11 sm:size-9"
              aria-label="Remove screenshot"
              onClick={() => setScreenshot(undefined)}
            >
              <X />
            </Button>
          </div>
        ) : null}
        {screenshotError ? <Problem>{screenshotError}</Problem> : null}
        {me ? null : (
          <div className="space-y-1.5">
            <Label className="block text-sm font-medium text-dim" htmlFor="feedback-email">
              Your email, if you’d like a reply
            </Label>
            <Input
              id="feedback-email"
              type="email"
              autoComplete="email"
              className="h-11 sm:h-8"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        )}
        {failure === 'unavailable' ? (
          <Problem>
            Feedback could not be sent from this browser, which may be blocking analytics. Your message is still here; you can{' '}
            <a href={NEW_ISSUE} target="_blank" rel="noreferrer" className="text-info underline hover:text-parchment">
              report it on GitHub
            </a>{' '}
            instead.
          </Problem>
        ) : null}
        {typeof failure === 'object' ? <Problem>{failure.error}</Problem> : null}
        <div className="flex flex-wrap items-center gap-2">
          {screenshot ? null : (
            <Label className="relative inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-dim hover:bg-raised hover:text-bone sm:h-8 has-focus-visible:ring-2 has-focus-visible:ring-ring">
              <ImagePlus aria-hidden className="size-4 shrink-0" />
              <span>Add screenshot</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  attach(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </Label>
          )}
          <Button type="submit" className="ml-auto h-11 sm:h-8" disabled={sending || !message.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
        <p className="text-2xs text-faint">
          Sends this page, your device and Praetorium’s version with your message. Paste or drop an image to attach it
          <span className="max-sm:hidden">, and press {searchShortcutModifier(navigator.userAgent)} Enter to send</span>.
        </p>
        {children}
      </DialogBody>
    </form>
  )
}
