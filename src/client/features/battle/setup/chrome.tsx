import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '../../../useMediaQuery'
import { createContext, useContext, type ReactNode } from 'react'
import { gameReferencesQuery } from '../../../queries'
import { sideName, type Side } from '../../../sides'
import { tint } from '../battleTints'
import { SidePlayers } from '../PlayerName'
import { dispositionTone } from '../../../components/rosterSetup'
import { capitalised } from '../../../../core/text'

/**
 * The parts every setup step is built from.
 *
 * Setup is one spine the table walks down together, and it should read as one page
 * rather than a pile of steps each drawn separately, so every step shares one way of
 * showing a side, one way of marking a choice and one way of saying something in passing.
 */

/**
 * The side a phone is showing in a step that lists both.
 *
 * Two columns of units do not fit a phone, so below the two-column width each step shows
 * one side at a time and the switch above it changes which. Kept for the whole page, so a
 * player working through their own side stays on it from step to step.
 */
/** Below the `md` breakpoint, where a step's two columns become one. */
const SIDE_SWITCH_WIDTH = '(max-width: 767px)'
const SideFocus = createContext<{ side: number; show: (side: number) => void } | null>(null)
export const SideFocusProvider = SideFocus.Provider

/** The phone's side switch, or nothing where both sides show at once. */
function useSideSwitch(sides: Side[]) {
  const focus = useContext(SideFocus)
  // Rendered only where it shows, so a wide screen does not carry each side's answer twice.
  const phone = useMediaQuery(SIDE_SWITCH_WIDTH)
  return focus && phone && sides.length > 1 ? focus : null
}

/**
 * The two sides as tabs, each carrying the step's answer for it so the hidden one is still
 * read. The one not shown says it can be opened and points the way it sits.
 */
export function SideSwitch({ sides, renderSide }: { sides: Side[]; renderSide: (side: Side) => ReactNode }) {
  const focus = useSideSwitch(sides)
  if (!focus) return null
  return (
    <fieldset className="grid grid-cols-2">
      <legend className="sr-only">Show side</legend>
      {sides.map((side, position) => {
        const shown = focus.side === side.index
        const Arrow = position ? ArrowRight : ArrowLeft
        return (
          <button
            key={side.index}
            type="button"
            aria-pressed={shown}
            className={cn(
              'min-h-12 min-w-0 border-t-[3px] bg-panel px-3 py-2 transition-opacity',
              tint(side.index).edge,
              position ? 'text-right' : 'text-left',
              // Faded rather than darkened, since a darker tab reads as the pressed one.
              !shown && 'border-b border-b-edge opacity-50 hover:opacity-80',
            )}
            onClick={() => focus.show(side.index)}
          >
            <span className={cn('block truncate text-xs font-bold tracking-label uppercase', tint(side.index).text)}>{sideName(side)}</span>
            <span className="block truncate text-xs">{renderSide(side)}</span>
            {shown ? null : (
              <span
                className={cn(
                  'mt-1 flex items-center gap-1 text-xs font-semibold text-bone',
                  position ? 'justify-end' : 'flex-row-reverse justify-end',
                )}
              >
                Tap to view
                <Arrow aria-hidden className="size-3.5" />
              </span>
            )}
          </button>
        )
      })}
    </fieldset>
  )
}

/** The way on to the other side at the foot of the one shown, which takes the reader back to the top of the step. */
export function SideSwitchNext({ sides }: { sides: Side[] }) {
  const focus = useSideSwitch(sides)
  const other = focus ? sides.find((side) => side.index !== focus.side) : undefined
  if (!focus || !other) return null
  const leftward = sides.indexOf(other) === 0
  return (
    <Button
      variant="outline"
      className="h-11 w-full"
      onClick={(event) => {
        const step = event.currentTarget.closest('section')
        focus.show(other.index)
        landOn(step)
      }}
    >
      {leftward ? <ArrowLeft data-icon="inline-start" aria-hidden /> : null}
      <span className="min-w-0 truncate">Show {sideName(other)}</span>
      {leftward ? null : <ArrowRight data-icon="inline-end" aria-hidden />}
    </Button>
  )
}

/**
 * Brings a step's heading to the top after a press redraws the page, rather than leaving the
 * reader wherever the change dropped them. A frame later, once the redraw has landed and the
 * browser has kept its place across it, or the two scrolls fight.
 */
export function landOn(step: Element | null) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  requestAnimationFrame(() => step?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' }))
}

/** Something the step says in passing: what a rule implies, or who may do this. */
export function SetupNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={cn('rounded-sm border border-edge bg-sunken px-3 py-2 text-xs text-dim', className)}>{children}</p>
}

/**
 * One side's column: the side's colour as a rule across the top and its content
 * directly under it, so the two sides are the same two colours from the first
 * screen to the last without a panel around each. A phone shows only the side its
 * switch is on.
 */
export function SetupSidePanel({
  side,
  named = false,
  children,
  className = '',
}: {
  side: Side
  /** Pictured and named where the side is introduced; later columns keep the name for screen readers only. */
  named?: boolean
  children: ReactNode
  className?: string
}) {
  const focus = useContext(SideFocus)
  return (
    <div
      className={cn(
        'min-w-0 space-y-2 border-t-[3px] pt-3',
        tint(side.index).edge,
        // On a phone the switch above already carries the side's colour and name.
        focus && (focus.side === side.index ? 'max-md:border-t-0 max-md:pt-0' : 'max-md:hidden'),
        className,
      )}
    >
      {named ? <SidePlayers side={side} className={focus ? 'max-md:hidden' : undefined} /> : <h3 className="sr-only">{sideName(side)}</h3>}
      {children}
    </div>
  )
}

/**
 * How a chosen thing looks, wherever setup asks for one.
 *
 * A side, a battlefield layout and a mission pack are the same question three times,
 * so they share one ring, one tint and one weight.
 */
export const CHOSEN = 'border-parchment bg-parchment/10 ring-1 ring-parchment'
export const CHOOSABLE = 'border-edge hover:border-edge-strong'

/** The battle size control, which the roster chooser hands focus to when no list fits the size. */
export const BATTLE_SIZE_CONTROL = 'battle-size'

/**
 * Names a force disposition the way the pack does.
 *
 * A list stores the slug it was built with; only the synced pack knows what to call
 * it. One whose name this instance cannot resolve is left unnamed rather than shown
 * a slug dressed up as a title.
 */
export function useDispositionNames() {
  const { data: references } = useQuery(gameReferencesQuery())
  return (id: string | null | undefined) => (id ? (references?.dispositions.find((entry) => entry.id === id) ?? null) : null)
}

/** A disposition in the colour the roster builder gave it, or nothing at all. */
export function DispositionChip({ disposition, className = '' }: { disposition: { id: string; name: string } | null; className?: string }) {
  if (!disposition) return null
  return (
    <span data-disposition={disposition.id} className={cn('chip', dispositionTone(disposition.id), className)}>
      {disposition.name}
    </span>
  )
}

/**
 * A value the log stores, written the way the rest of the screen writes a name.
 *
 * Where a unit starts and what it may do before the battle are the same vocabulary —
 * `deep-strike`, `scouts` — read in two sections, so one of them spelling it
 * `Deep strike` and the other `Deep Strike` would be the same fact in two hands.
 */
export const formationLabel = (value: string) => capitalised(value.replaceAll('-', ' '))
