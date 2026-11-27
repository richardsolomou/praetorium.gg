import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, X } from 'lucide-react'
import { posthog } from 'posthog-js'
import { type Ref, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Choice } from '../../components/Choice'
import { DialogBody, DialogFooter } from '../../components/Dialog'
import { feedbackScreenshotPath, FEEDBACK_MESSAGE_MAX_LENGTH, feedbackTicketMessage, type FeedbackKind } from '../../../contracts/feedback'
import { uploadFeedbackScreenshot } from '../../functions'
import { NEW_ISSUE } from '../../projectLinks'
import { meQuery } from '../../queries'
import { prepareFeedbackScreenshot } from './screenshot'
import { type FeedbackDraft, refreshSupport, startConversation } from './support'
import { Problem } from '../../components/Problem'
import { errorMessage } from '../../queryClient'

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
  onCancel,
  shown,
}: {
  draft?: FeedbackDraft
  /** The message box, which the panel focuses as it opens. */
  messageRef?: Ref<HTMLTextAreaElement>
  onSent: (sent: { ticketId: string; screenshotLost: boolean; signedOutEmail: boolean }) => void
  onCancel: () => void
  /** Whether the form is on screen, so a pasted or dropped image elsewhere in the dialog is not taken for it. */
  shown: boolean
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
    if (!shown) return
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
  }, [attach, shown])

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
      <DialogBody>
        {context ? (
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-dim">About</span>
            <p className="rounded-md border border-edge px-3 py-2 text-sm text-bone">{context}</p>
            <p className="text-xs text-dim">We send this with your message.</p>
          </div>
        ) : null}
        <Choice
          label="What kind of feedback?"
          value={kind ?? null}
          columns={3}
          options={KINDS.map((option) => ({ value: option.kind, name: option.label }))}
          onChange={setKind}
        />
        <div className="space-y-1.5">
          <Label htmlFor="feedback-message">{draft?.question ?? 'Message'}</Label>
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
          <p className="text-xs text-dim">We send this page, your device and Praetorium’s version with it.</p>
        </div>
        {me ? null : (
          <div className="space-y-1.5">
            <Label htmlFor="feedback-email">Email for a reply (optional)</Label>
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
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Screenshot (optional)</span>
          {screenshot ? (
            <div className="flex items-start gap-2">
              <img
                src={screenshot}
                alt="Attached screenshot"
                className="ph-no-capture max-h-32 min-w-0 border border-edge object-contain"
              />
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
          ) : (
            <>
              <Label className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-edge px-3 text-sm font-normal text-dim hover:border-info hover:text-info sm:min-h-9 has-focus-visible:border-info">
                <ImagePlus aria-hidden className="size-4 shrink-0" />
                <span>Attach screenshot</span>
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
              <p className="text-xs text-dim">Or paste or drop an image here.</p>
            </>
          )}
          {screenshotError ? <Problem>{screenshotError}</Problem> : null}
        </div>
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
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Sending…' : 'Send feedback'}
        </Button>
      </DialogFooter>
    </form>
  )
}
