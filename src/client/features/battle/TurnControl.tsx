import { ArrowLeftRight } from 'lucide-react'
import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PHASES, type Command } from '../../../core/battle'
import type { BattleClock } from '../../../core/battleClock'
import { opposingSide } from '../../../core/battlePrimitives'
import { type BattleView } from '../../../core/battleView'
import { tint } from './battleTints'
import { Elapsed } from './Elapsed'
import { UndoLatest } from './UndoLatest'
import { useHydrated } from '../../useClientValue'

type Props = {
  view: BattleView
  clock: BattleClock
  send: (command: Command) => void
  pending: boolean
  /** Why the turn cannot move at all. Disables the control. */
  blockReason: string | null
  /** Opens the scoring prompt when this advance settles a card, and advances when it does not. */
  onAdvance: () => void
  /** A control that sits before Undo, such as a phone's command points. */
  before?: ReactNode
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
export function TurnControl({ view, clock, send, pending, blockReason, onAdvance, before, className = '' }: Props) {
  const active = view.players.find((player) => player.isActive)
  const activeSide = active?.side ?? 0
  const at = PHASES.indexOf(view.phase)
  // Drawn by the server before the page can act, so until then it says why a press would do nothing.
  const hydrated = useHydrated()
  const label = !hydrated ? 'Connecting…' : view.phase === 'end' ? 'Pass the turn' : `End the ${view.phase} phase`
  const section = useRef<HTMLElement>(null)
  // Its height changes with a block reason, the clock button and text size, and phone toasts stand on top of it.
  useLayoutEffect(() => {
    const element = section.current
    if (!element) return
    const root = document.documentElement.style
    const observer = new ResizeObserver(() => root.setProperty('--turn-control-height', `${element.offsetHeight}px`))
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.removeProperty('--turn-control-height')
    }
  }, [])

  return (
    <section ref={section} data-onboarding="battle-live-turn" data-turn-control className={cn('space-y-2', className)}>
      {/* Whose turn is ending, in their colour, so the green button below can stay the one primary action. */}
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-0.5', tint(activeSide).rail)} />
      {/* Phases done as full bars, the one being played in green, the rest as hairlines. */}
      <ol className="grid grid-cols-6 gap-1" aria-label={`${view.phase} phase`}>
        {PHASES.map((phase, index) => (
          <li key={phase} className="min-w-0" aria-current={phase === view.phase ? 'step' : undefined}>
            <span className="line-segment" data-line={index < at ? 'done' : index === at ? 'now' : 'todo'} />
            <span
              // A phone reads the phase off the lit bar and the scoreboard, so the names give their height back to the page.
              className={`mt-1 block text-center font-display text-3xs font-bold tracking-label uppercase max-sm:sr-only ${
                phase === view.phase ? 'text-bone' : index < at ? 'text-dim' : 'text-faint'
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
      {/* Wraps the phase button onto its own row when large text leaves it too little width. */}
      <div className="flex flex-wrap items-stretch gap-2">
        {before}
        <UndoLatest compact className="h-auto min-h-11 shrink-0 px-3.5" undo={view} send={send} pending={pending} />
        <Button
          variant="default"
          className="h-auto min-h-11 min-w-32 flex-1 text-center text-sm font-semibold whitespace-normal sm:min-w-40 sm:text-base sm:font-bold"
          disabled={!hydrated || pending || Boolean(blockReason)}
          aria-busy={!hydrated || undefined}
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
