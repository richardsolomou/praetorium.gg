import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PHASES, type Command } from '../../../core/battle'
import { type BattleView } from '../../../core/battleView'
import { tint } from './tints'
import { DrawUndoAlert } from './DrawUndoAlert'

type Props = {
  view: BattleView
  send: (command: Command) => void
  pending: boolean
  blockReason: string | null
  /** Opens the scoring prompt when this advance settles a card, and advances when it does not. */
  onAdvance: () => void
  className?: string
}

/**
 * Where the battle moves forward.
 *
 * Advancing belongs to the battle rather than to either side's panel, so the two
 * panels stay the same shape and their numbers line up across the table whichever
 * side is taking the turn.
 */
export function TurnControl({ view, send, pending, blockReason, onAdvance, className = '' }: Props) {
  const [confirmingUndo, setConfirmingUndo] = useState(false)
  const active = view.players.find((player) => player.isActive)
  const activeSide = active?.side ?? 0
  const at = PHASES.indexOf(view.phase)
  const label = view.phase === 'end' ? 'Pass the turn' : `End the ${view.phase} phase`

  return (
    <section className={`space-y-2 ${className}`}>
      <ol className="flex gap-0.5" aria-label={`${view.phase} phase`}>
        {PHASES.map((phase, index) => (
          <li key={phase} className="min-w-0 flex-1" aria-current={phase === view.phase ? 'step' : undefined}>
            <span className={`block h-1 ${index <= at ? tint(activeSide).rail : 'bg-edge-strong'}`} />
            <span
              className={`mt-1 block truncate text-center text-[0.5625rem] font-semibold tracking-[0.06em] uppercase ${
                phase === view.phase ? 'text-bone' : 'text-faint'
              }`}
            >
              {phase}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex items-stretch gap-2">
        <Button variant="default" className="h-11 min-w-0 flex-1 text-base" disabled={pending || Boolean(blockReason)} onClick={onAdvance}>
          {label}
        </Button>
        <Button
          variant="outline"
          className="h-11 shrink-0 px-3"
          aria-label="Undo latest action"
          title="Undo latest action"
          disabled={view.undoable === null || pending}
          onClick={() => {
            if (view.undoable === null) return
            if (view.undoableDraw) setConfirmingUndo(true)
            else send({ kind: 'undo', target: view.undoable })
          }}
        >
          <Undo2 />
        </Button>
      </div>
      {blockReason ? (
        <p className="border border-discarded/50 bg-discarded/10 p-2 text-center text-xs text-discarded">{blockReason}</p>
      ) : null}
      <DrawUndoAlert
        open={confirmingUndo}
        pending={pending}
        onOpenChange={setConfirmingUndo}
        onConfirm={() => {
          if (view.undoable === null) return
          setConfirmingUndo(false)
          send({ kind: 'undo', target: view.undoable })
        }}
      />
    </section>
  )
}
