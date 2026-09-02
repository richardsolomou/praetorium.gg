import { Button } from '@/components/ui/button'
import { PHASES, type Command } from '../../../core/battle'
import { type BattleView } from '../../../core/battleView'
import { tint } from './tints'
import { UndoLatestButton, UndoLatestConfirmation, useUndoLatest } from './UndoLatest'

type Props = {
  view: BattleView
  send: (command: Command) => void
  pending: boolean
  /** Why the turn cannot move at all. Disables the control. */
  blockReason: string | null
  /** What the active side still owes. Said, never enforced: anyone at the table may do it. */
  note: string | null
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
export function TurnControl({ view, send, pending, blockReason, note, onAdvance, className = '' }: Props) {
  const undo = useUndoLatest({ undoable: view.undoable, undoableDraw: view.undoableDraw, send })
  const active = view.players.find((player) => player.isActive)
  const activeSide = active?.side ?? 0
  const at = PHASES.indexOf(view.phase)
  const label = view.advanceRequested
    ? view.phase === 'end'
      ? 'Pass the turn'
      : `Finish the ${view.phase} phase`
    : view.phase === 'end'
      ? 'Pass the turn'
      : `End the ${view.phase} phase`

  return (
    <section data-turn-control className={`space-y-2 ${className}`}>
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
        {/*
         * Tinted to whichever side is taking the turn, like the phase rail above it.
         * This is the most-pressed control in the game and the one thing on the middle
         * column that belongs to a side, so wearing one colour all game left the only
         * question it answers — whose turn is ending — to be read off the text.
         */}
        <Button
          variant="default"
          className={`h-11 min-w-0 flex-1 text-base ${tint(activeSide).fill}`}
          disabled={pending || Boolean(blockReason)}
          onClick={onAdvance}
        >
          {label}
        </Button>
        <UndoLatestButton compact className="h-11 shrink-0 px-3" disabled={view.undoable === null || pending} onClick={undo.request} />
      </div>
      {blockReason ? (
        <p className="border border-discarded/50 bg-discarded/10 p-2 text-center text-xs text-discarded">{blockReason}</p>
      ) : note ? (
        <p className="border border-edge bg-sunken p-2 text-center text-xs text-dim">{note}</p>
      ) : null}
      <UndoLatestConfirmation pending={pending} control={undo} />
    </section>
  )
}
