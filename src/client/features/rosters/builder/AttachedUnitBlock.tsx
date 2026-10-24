import type { ReactNode } from 'react'
import { nicknamedUnit } from '../../../../core/unitNotes'

type Props = {
  /** The datasheet the others joined, which names the block for assistive technology. */
  name: string
  /** The custom name of the unit the others joined, which names the whole unit. */
  nickname?: string
  points: number
  /** Whether the cards carry their actions menu, which sits to the right of each card's points. */
  editable: boolean
  children: ReactNode
  /** What the whole unit does as one, along the outline's foot; the bar hides when they render nothing. */
  actions?: ReactNode
}

/**
 * Datasheets that play as one unit, outlined together with the unit's cost, and any name,
 * set into the outline above the cards' own points.
 */
export function AttachedUnitBlock({ name, nickname, points, editable, children, actions }: Props) {
  return (
    <section aria-label={nicknamedUnit(name, nickname)} className="mt-3 border border-edge-strong px-1.5 pb-1.5 first:mt-1">
      <p className={`readout -mt-2 ml-auto w-fit ${editable ? 'mr-11' : 'mr-2.5'} bg-sunken px-1.5 text-xs leading-4 text-dim`}>
        {nickname ? `${nickname} · ` : ''}
        {points} pts
      </p>
      <div className="space-y-1.5">{children}</div>
      <div data-unit-actions className="mt-1.5 border-x border-b border-edge empty:hidden">
        {actions}
      </div>
    </section>
  )
}
