import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { type Side, sideName } from '../../sides'
import type { Command } from '../../../core/battle'
import { UndoLatest, type UndoTarget } from './UndoLatest'
import { BattleDialogContent, BattlePromptDialog } from './BattlePromptDialog'

type Props = {
  side: Side
  pending: boolean
  onReveal: () => void
  onCancel?: () => void
  undo: UndoTarget
  send: (command: Command) => void
}

export function SecretMissionHandoff({ side, pending, onReveal, onCancel, undo, send }: Props) {
  return (
    <BattlePromptDialog open minimizedLabel={`Secret Mission · ${sideName(side)}`} onOpenChange={(open) => !open && onCancel?.()}>
      <BattleDialogContent showCloseButton={Boolean(onCancel)} minimizeDisabled={pending}>
        <DialogHeader>
          <DialogTitle>Secret Mission action · {sideName(side)}</DialogTitle>
          <DialogDescription>
            {side.played
              ? 'Reveal the face-down mission to continue.'
              : `Hand this device to ${sideName(side)}. When they are ready, revealing the mission opens its scoring prompt.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <UndoLatest undo={undo} send={send} pending={pending} />
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
  )
}
