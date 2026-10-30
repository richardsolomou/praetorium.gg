import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Choice } from '../../components/Choice'
import { DialogBody, DialogFooter } from '../../components/Dialog'
import { feedbackScreenshotPath, FEEDBACK_KINDS, type FeedbackKind } from '../../../contracts/feedback'
import { uploadFeedbackScreenshot } from '../../functions'
import { NEW_ISSUE } from '../../projectLinks'
import { meQuery } from '../../queries'
import { FEEDBACK_MESSAGE_MAX_LENGTH, feedbackTicketMessage } from './feedback'
import { prepareFeedbackScreenshot } from './screenshot'
import { refreshSupport, startConversation } from './support'
import { Problem } from '../../components/Problem'
import { errorMessage } from '../../queryClient'

/** A new conversation, sent from the page the player is on so its session replay shows what they were looking at. */
export function FeedbackForm({
  onStarted,
  onSent,
  onCancel,
}: {
  /** Called once the player has entered anything, so the panel keeps this form in place. */
  onStarted: () => void
  onSent: (ticketId: string, screenshotLost: boolean) => void
  onCancel: () => void
}) {
  const { data: me } = useQuery(meQuery())
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<FeedbackKind>('Problem')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [screenshot, setScreenshot] = useState<string>()
  const [screenshotError, setScreenshotError] = useState<string>()
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<'unavailable' | { error: string }>()
  const started = kind !== 'Problem' || message !== '' || email !== '' || screenshot !== undefined
  useEffect(() => {
    if (started) onStarted()
  }, [started, onStarted])

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
    setSending(true)
    setFailure(undefined)
    try {
      // The text matters more than the picture, so a failed upload still sends the feedback.
      const file = screenshot ? await uploadFeedbackScreenshot({ data: { image: screenshot } }).catch(() => undefined) : undefined
      const sent = await startConversation(
        feedbackTicketMessage({
          kind,
          message,
          screenshotUrl: file ? new URL(feedbackScreenshotPath(file), window.location.origin).href : undefined,
        }),
        me ? undefined : email.trim() || undefined,
      )
      if (!sent) return setFailure('unavailable')
      void refreshSupport(queryClient)
      onSent(sent.ticket_id, Boolean(screenshot && !file))
    } catch (error) {
      setFailure({ error: errorMessage(error, 'Your feedback could not be sent. Try again.') })
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <DialogBody>
        <Choice
          label="What kind of feedback?"
          value={kind}
          columns={3}
          options={FEEDBACK_KINDS.map((value) => ({ value, name: value }))}
          onChange={setKind}
        />
        <div className="space-y-1.5">
          <Label className="eyebrow block" htmlFor="feedback-message">
            Message
          </Label>
          <Textarea
            id="feedback-message"
            required
            rows={5}
            maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        {me ? null : (
          <div className="space-y-1.5">
            <Label className="eyebrow block" htmlFor="feedback-email">
              Email for a reply (optional)
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
        <div className="space-y-1.5">
          <span className="eyebrow block">Screenshot (optional)</span>
          {screenshot ? (
            <div className="flex items-start gap-2">
              <img
                src={screenshot}
                alt="Attached screenshot"
                className="ph-no-capture max-h-32 min-w-0 border border-edge object-contain"
              />
              <Button
                type="button"
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
              <Label className="relative flex min-h-11 cursor-pointer items-center gap-2 border border-dashed border-edge px-3 text-sm text-dim hover:border-info hover:text-info sm:min-h-9 has-focus-visible:border-info">
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
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Sending…' : 'Send feedback'}
        </Button>
      </DialogFooter>
    </form>
  )
}
