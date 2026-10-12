import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { saveJournalEvent } from '../../functions'
import { journalQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { JOURNAL_EVENT_NAME_MAX_LENGTH } from '../../../core/gameJournal'

export function JournalEventDialog({
  open,
  event,
  onClose,
}: {
  open: boolean
  /** The event to rename, or null to add one. */
  event: { id: string; name: string } | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  // Chosen once per dialog, so a save sent twice adds one event.
  const [id] = useState(() => event?.id ?? crypto.randomUUID())
  const [name, setName] = useState(event?.name ?? '')
  const save = useMutation({
    mutationFn: () => saveJournalEvent({ data: { id, name } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: journalQuery().queryKey })
      onClose()
    },
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !save.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? 'Rename event' : 'Add an event'}</DialogTitle>
          <DialogDescription>A tournament, campaign or league run elsewhere, to keep its games together.</DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(submitted) => {
            submitted.preventDefault()
            save.mutate()
          }}
        >
          <DialogBody className="space-y-3">
            <div>
              <Label className="eyebrow block" htmlFor="journal-event-name">
                Event name
              </Label>
              <Input
                id="journal-event-name"
                required
                maxLength={JOURNAL_EVENT_NAME_MAX_LENGTH}
                value={name}
                onChange={(changed) => setName(changed.target.value)}
                className="mt-1"
              />
            </div>
            {save.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(save.error, 'Could not save the event. Try again.')}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || !name.trim()}>
              {event ? 'Save name' : 'Add event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
