import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type Side, sideName } from '../../sides'
import type { Command } from '../../../core/battle'
import { UndoLatestButton, UndoLatestConfirmation, useUndoLatest } from './UndoLatest'

type Props = {
  side: Side
  pending: boolean
  onReveal: () => void
  onCancel?: () => void
  undoable: number | null
  undoableDraw: boolean
  send: (command: Command) => void
}

export function SecretMissionHandoff({ side, pending, onReveal, onCancel, undoable, undoableDraw, send }: Props) {
  const undo = useUndoLatest({ undoable, undoableDraw, send })
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onCancel?.()}>
        <DialogContent showCloseButton={Boolean(onCancel)} className="rounded-none border border-edge bg-panel text-bone sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase">Secret Mission action · {sideName(side)}</DialogTitle>
            <DialogDescription className="text-dim">
              {side.played
                ? 'Reveal the face-down mission to continue.'
                : `Hand this device to ${sideName(side)}. When they are ready, revealing the mission opens its scoring prompt.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <UndoLatestButton disabled={pending || undoable === null} onClick={undo.request} />
            {onCancel ? (
              <Button variant="outline" disabled={pending} onClick={onCancel}>
                Back
              </Button>
            ) : null}
            <Button disabled={pending} onClick={onReveal}>
              Reveal and continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UndoLatestConfirmation pending={pending} control={undo} />
    </>
  )
}
