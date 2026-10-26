import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Command } from '../../../core/battle'
import type { BattleView } from '../../../core/battleView'
import { ConfirmDialog } from '../../components/ConfirmDialog'

/** What the latest command is and whether undoing it returns drawn missions, as the battle view says. */
export type UndoTarget = Pick<BattleView, 'undoable' | 'undoableDraw'>

/**
 * Undoes the latest command, after a confirmation when it would return drawn missions
 * to the deck. Renders the button where it sits; the confirmation is a portal.
 */
export function UndoLatest({
  undo: { undoable, undoableDraw },
  send,
  pending,
  beforeUndo,
  compact = false,
  className = '',
}: {
  undo: UndoTarget
  send: (command: Command) => void
  pending: boolean
  beforeUndo?: () => void
  compact?: boolean
  className?: string
}) {
  const [confirming, setConfirming] = useState<number | null>(null)
  const submit = (target: number) => {
    beforeUndo?.()
    send({ kind: 'undo', target })
  }
  return (
    <>
      <Button
        variant="outline"
        className={className}
        aria-label="Undo latest action"
        title="Undo latest action"
        disabled={pending || undoable === null}
        onClick={() => {
          if (undoable === null) return
          if (undoableDraw) setConfirming(undoable)
          else submit(undoable)
        }}
      >
        <Undo2 />
        {compact ? null : 'Undo latest action'}
      </Button>
      <ConfirmDialog
        open={confirming !== null}
        title="Undo mission draw?"
        description="This returns those secondary missions to the deck. You can draw replacements at random or select them yourself."
        cancel="Keep missions"
        confirm="Undo draw"
        destructive
        pending={pending}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming === null) return
          const target = confirming
          setConfirming(null)
          submit(target)
        }}
      />
    </>
  )
}
