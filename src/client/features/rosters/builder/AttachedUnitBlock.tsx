import type { ReactNode } from 'react'

type Props = {
  /** The custom name of the unit the others joined, which names the whole unit. */
  nickname?: string
  points: number
  /** Whether the cards carry their actions menu, which sits to the right of each card's points. */
  editable: boolean
  children: ReactNode
}

/**
 * Datasheets that play as one unit, outlined together with the unit's cost, and any name,
 * set into the outline above the cards' own points.
 */
export function AttachedUnitBlock({ nickname, points, editable, children }: Props) {
  return (
    <section aria-label={nickname ?? 'Attached unit'} className="mt-3 border border-edge-strong px-1.5 pb-1.5 first:mt-1">
      <p className={`readout -mt-2 ml-auto w-fit ${editable ? 'mr-11' : 'mr-2.5'} bg-sunken px-1.5 text-xs leading-4 text-dim`}>
        {nickname ? `${nickname} · ` : ''}
        {points} pts
      </p>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}
