import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type Side, sideName } from '../../sides'
import type { Command } from '../../../core/battle'
import { UndoLatestButton, UndoLatestConfirmation, useUndoLatest } from './UndoLatest'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'

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
      <BattlePromptDialog open minimizedLabel={`Secret Mission · ${sideName(side)}`} onOpenChange={(open) => !open && onCancel?.()}>
        <BattleDialogContent showCloseButton={Boolean(onCancel)} minimizeDisabled={pending} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Secret Mission action · {sideName(side)}</DialogTitle>
            <DialogDescription>
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
        </BattleDialogContent>
      </BattlePromptDialog>
      <UndoLatestConfirmation pending={pending} control={undo} />
    </>
  )
}
