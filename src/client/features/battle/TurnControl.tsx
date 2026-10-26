import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PHASES, type Command } from '../../../core/battle'
import type { BattleClock } from '../../../core/battleClock'
import { type BattleView } from '../../../core/battleView'
import { tint } from './battleTints'
import { Elapsed } from './Elapsed'
import { UndoLatest } from './UndoLatest'

type Props = {
  view: BattleView
  clock: BattleClock
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
export function TurnControl({ view, clock, send, pending, blockReason, note, onAdvance, className = '' }: Props) {
  const active = view.players.find((player) => player.isActive)
  const activeSide = active?.side ?? 0
  const at = PHASES.indexOf(view.phase)
  const label = view.phase === 'end' ? 'Pass the turn' : `End the ${view.phase} phase`

  return (
    <section data-onboarding="battle-live-turn" data-turn-control className={cn('space-y-2', className)}>
      <ol className="flex gap-0.5" aria-label={`${view.phase} phase`}>
        {PHASES.map((phase, index) => (
          <li key={phase} className="min-w-0 flex-auto" aria-current={phase === view.phase ? 'step' : undefined}>
            <span className={`block h-1 ${index <= at ? tint(activeSide).rail : 'bg-edge-strong'}`} />
            <span
              className={`mt-1 block truncate text-center text-3xs font-semibold tracking-label uppercase ${
                phase === view.phase ? 'text-bone' : 'text-faint'
              }`}
            >
              {phase}
            </span>
            {phase === view.phase && active ? (
              <Elapsed
                clock={clock}
                match={{ side: activeSide, round: view.round, phase }}
                className="block text-center text-3xs text-dim"
              />
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex items-stretch gap-2">
        {/*
         * Tinted to whichever side is taking the turn, like the phase rail above it.
         * This is the most-pressed control in the game and the one thing on the middle
         * column that belongs to a side, and its tint answers whose turn is ending
         * before the text is read.
         */}
        <Button
          variant="default"
          className={`h-auto min-h-11 min-w-0 flex-1 text-center text-base whitespace-normal ${tint(activeSide).fill}`}
          disabled={pending || Boolean(blockReason)}
          onClick={onAdvance}
        >
          {label}
        </Button>
        <UndoLatest compact className="h-auto min-h-11 shrink-0 px-3" undo={view} send={send} pending={pending} />
      </div>
      {blockReason ? (
        <p className="border border-discarded/50 bg-discarded/10 p-2 text-center text-xs text-discarded">{blockReason}</p>
      ) : note ? (
        <p className="border border-edge bg-sunken p-2 text-center text-xs text-dim">{note}</p>
      ) : null}
    </section>
  )
}
