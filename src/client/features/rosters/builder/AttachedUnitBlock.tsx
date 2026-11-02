import type { ReactNode } from 'react'
import { nicknamedUnit } from '../../../../core/unitNotes'

type Props = {
  /** The datasheet the others joined, which names the block for assistive technology. */
  name: string
  /** The custom name of the unit the others joined, which names the whole unit. */
  nickname?: string
  /** The card of the unit the others joined. */
  bodyguard: ReactNode
  /** The leaders' and support's cards, indented under the bodyguard's. */
  children: ReactNode
  /** What the whole unit does as one, below its cards; the bar hides when they render nothing. */
  actions?: ReactNode
  /** Whether the selected unit is one of these, so the block's gate reads as current. */
  current?: boolean
}

/** Datasheets that play as one unit: the unit the others joined, with their cards indented under it. */
export function AttachedUnitBlock({ name, nickname, bodyguard, children, actions, current = false }: Props) {
  return (
    <section aria-label={nicknamedUnit(name, nickname)} data-gate={current ? 'current' : undefined} className="space-y-1.5">
      {bodyguard}
      <div className="ml-3 space-y-1.5">{children}</div>
      <div data-unit-actions className="ml-3 overflow-hidden rounded-lg border border-edge empty:hidden">
        {actions}
      </div>
    </section>
  )
}
