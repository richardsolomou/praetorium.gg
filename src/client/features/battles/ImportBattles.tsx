import { useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { posthog } from 'posthog-js'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ImportSource } from '../../../core/importSources'
import { Choice } from '../../components/Choice'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { NEW_ISSUE } from '../../projectLinks'
import { errorMessage } from '../../queryClient'
import { FEEDBACK_MESSAGE_MAX_LENGTH, feedbackTicketMessage } from '../feedback/feedback'
import { openConversation, refreshSupport, startConversation } from '../feedback/support'
import { BattlebaseImport } from './BattlebaseImport'

const APPS: { value: ImportSource | 'other'; name: string; detail: string }[] = [
  { value: 'battlebase', name: 'BattleBase', detail: 'Finished public games' },
  { value: 'other', name: 'Another app', detail: 'Ask for it to be added' },
]

/** Brings finished games in from another battle tracker, or asks for one that cannot be imported yet. */
export function ImportBattles() {
  const [open, setOpen] = useState(false)
  const [app, setApp] = useState<ImportSource | 'other'>('battlebase')
  const [busy, setBusy] = useState(false)
  const close = () => {
    setOpen(false)
    setApp('battlebase')
  }
  const picker = <Choice label="Where did you play?" value={app} columns={2} options={APPS} disabled={busy} onChange={setApp} />

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (next) setOpen(true)
        else close()
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Download /> Import battles
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-2xl">Import battles</DialogTitle>
          <DialogDescription>
            Bring in games you finished on another battle tracker, as battles with their armies, missions, cards, stratagems, scores and
            command points, on the dates you played them.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts afresh. */}
        {open ? (
          app === 'other' ? (
            <SuggestApp picker={picker} onBusy={setBusy} onDone={close} />
          ) : (
            <BattlebaseImport picker={picker} onBusy={setBusy} onDone={close} />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** Asks for another app to be supported, as a feedback conversation the player can follow for a reply. */
function SuggestApp({ picker, onBusy, onDone }: { picker: ReactNode; onBusy: (busy: boolean) => void; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string>()
  const [failure, setFailure] = useState<'unavailable' | { error: string }>()
  const send = async () => {
    setSending(true)
    onBusy(true)
    setFailure(undefined)
    try {
      const message = [`Please support importing battles from ${name.trim()}.`, ...(details.trim() ? ['', details.trim()] : [])].join('\n')
      const started = await startConversation(feedbackTicketMessage({ kind: 'Idea', message }))
      if (!started) return setFailure('unavailable')
      posthog.capture('battle_import_app_suggested')
      void refreshSupport(queryClient)
      setSent(started.ticket_id)
    } catch (error) {
      setFailure({ error: errorMessage(error, 'Your suggestion could not be sent. Try again.') })
    } finally {
      setSending(false)
      onBusy(false)
    }
  }

  if (sent)
    return (
      <>
        <DialogBody>
          <output className="block text-lg font-bold">Thanks, your suggestion is in.</output>
          <p className="text-sm text-dim">Any reply arrives in your feedback, under the account menu.</p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onDone()
              openConversation(sent)
            }}
          >
            Open the conversation
          </Button>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    )

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) void send()
      }}
    >
      <DialogBody>
        {picker}
        <p className="text-sm">Tell us which app your games are in, and we’ll look at bringing them in too.</p>
        <div className="space-y-1">
          <Label htmlFor="import-app-name">App</Label>
          <Input id="import-app-name" value={name} maxLength={80} className="h-11" onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="import-app-details">Anything that would help (optional)</Label>
          <Textarea
            id="import-app-details"
            value={details}
            maxLength={FEEDBACK_MESSAGE_MAX_LENGTH - 200}
            rows={3}
            placeholder="How many games you have there, or whether it can export them"
            onChange={(event) => setDetails(event.target.value)}
          />
        </div>
        {failure === 'unavailable' ? (
          <Problem>
            Your suggestion could not be sent from this browser, which may be blocking analytics. You can{' '}
            <a href={NEW_ISSUE} target="_blank" rel="noreferrer" className="text-info underline hover:text-parchment">
              suggest it on GitHub
            </a>{' '}
            instead.
          </Problem>
        ) : failure ? (
          <Problem>{failure.error}</Problem>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button type="submit" disabled={!name.trim() || sending}>
          {sending ? 'Sending…' : 'Send suggestion'}
        </Button>
      </DialogFooter>
    </form>
  )
}
