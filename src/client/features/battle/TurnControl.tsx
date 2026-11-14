import { ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PHASES, type Command } from '../../../core/battle'
import type { BattleClock } from '../../../core/battleClock'
import { opposingSide } from '../../../core/battlePrimitives'
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
  /** Opens the scoring prompt when this advance settles a card, and advances when it does not. */
  onAdvance: () => void
  className?: string
}

/** What fits a sixth of the rail at any width; the full name stays for a screen reader. */
const SHORT: Record<(typeof PHASES)[number], string> = {
  command: 'Cmd',
  movement: 'Move',
  shooting: 'Shoot',
  charge: 'Charge',
  fight: 'Fight',
  end: 'End',
}

/**
 * Where the battle moves forward.
 *
 * Advancing belongs to the battle rather than to either side's panel, so the two
 * panels stay the same shape and their numbers line up across the table whichever
 * side is taking the turn.
 */
export function TurnControl({ view, clock, send, pending, blockReason, onAdvance, className = '' }: Props) {
  const active = view.players.find((player) => player.isActive)
  const activeSide = active?.side ?? 0
  const at = PHASES.indexOf(view.phase)
  const label = view.phase === 'end' ? 'Pass the turn' : `End the ${view.phase} phase`

  return (
    <section data-onboarding="battle-live-turn" data-turn-control className={cn('space-y-2', className)}>
      {/* Phases done solid, the one being played doubled, the rest dashed, in the colour of the side whose turn it is. */}
      <ol className={cn('grid grid-cols-6 gap-1', tint(activeSide).line)} aria-label={`${view.phase} phase`}>
        {PHASES.map((phase, index) => (
          <li key={phase} className="min-w-0" aria-current={phase === view.phase ? 'step' : undefined}>
            <span className="line-segment" data-line={index < at ? 'done' : index === at ? 'now' : 'todo'} />
            <span
              className={`mt-1 block text-center font-display text-3xs font-semibold tracking-label uppercase max-sm:sr-only ${
                phase === view.phase ? 'text-bone' : 'text-faint'
              }`}
            >
              <span aria-hidden>{SHORT[phase]}</span>
              <span className="sr-only">{phase}</span>
            </span>
            {phase === view.phase && active ? (
              <Elapsed
                clock={clock}
                match={{ side: activeSide, round: view.round, phase }}
                className="readout block text-center text-3xs text-dim max-sm:hidden"
              />
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex items-stretch gap-2">
        <UndoLatest compact className="h-auto min-h-11 shrink-0 rounded-xl px-3.5" undo={view} send={send} pending={pending} />
        {/*
         * Tinted to whichever side is taking the turn, like the phase rail above it.
         * This is the most-pressed control in the game and the one thing on the middle
         * column that belongs to a side, and its tint answers whose turn is ending
         * before the text is read.
         */}
        <Button
          variant="default"
          className={`h-auto min-h-11 min-w-0 flex-1 rounded-xl text-center font-display text-sm font-bold whitespace-normal ${tint(activeSide).fill}`}
          disabled={pending || Boolean(blockReason)}
          onClick={onAdvance}
        >
          {label}
        </Button>
      </div>
      {/*
       * The chess clock, once the table set a limit. A reaction in the other side's turn
       * takes time from the side reacting, and ending the phase hands the clock back.
       */}
      {clock.limitMs && active && clock.holder !== null ? (
        <Button
          variant="outline"
          size="sm"
          data-switch-clock
          className="w-full"
          disabled={pending}
          onClick={() =>
            send({ kind: 'switch-clock', side: clock.holder === activeSide ? (opposingSide(view, activeSide) ?? activeSide) : activeSide })
          }
        >
          <ArrowLeftRight aria-hidden />
          {clock.holder === activeSide ? 'Hand the clock over for a reaction' : 'Hand the clock back'}
        </Button>
      ) : null}
      {blockReason ? (
        <p className="rounded-lg border border-discarded/50 bg-discarded/10 p-2 text-center text-xs text-discarded">{blockReason}</p>
      ) : null}
    </section>
  )
}
