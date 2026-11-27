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

/** Datasheets that play as one unit: the unit the others joined, with their rows indented under it on a green hairline. */
export function AttachedUnitBlock({ name, nickname, bodyguard, children, actions, current = false }: Props) {
  return (
    <section aria-label={nicknamedUnit(name, nickname)} data-gate={current ? 'current' : undefined}>
      {bodyguard}
      {/*
       * Each row draws its own stretch of the line and its tick, and the last row's stretch stops at its tick, so the
       * line ends at the last datasheet that joined rather than running on toward the next unit.
       */}
      <div className="ml-3.5 pl-3 *:before:absolute *:before:top-5 *:before:-left-3 *:before:w-2 *:before:border-t *:before:border-parchment/60 *:after:absolute *:after:top-0 *:after:-bottom-px *:after:-left-3 *:after:border-l *:after:border-parchment/60 *:last:after:bottom-auto *:last:after:h-5">
        {children}
      </div>
      <div
        data-unit-actions
        className="pointer-events-none flex flex-wrap items-center gap-x-3 border-b border-edge py-1.5 pl-2 empty:hidden [&_button]:pointer-events-auto [&>div]:p-0 [&>div]:m-0"
      >
        {actions}
      </div>
    </section>
  )
}
