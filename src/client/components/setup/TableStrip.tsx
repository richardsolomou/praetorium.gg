import { Fragment } from 'react'
import type { Side } from '../../sides'
import { SidePlayers } from '../PlayerName'

/**
 * Who is playing whom, in one line above setup.
 *
 * The same pictures and names the side panels will carry once the battle starts, so
 * the table is recognised the same way throughout. It used to be two wide cards
 * naming each side's list and its points as well, which said what the armies step
 * says underneath in more detail and took a third of the screen to say it.
 *
 * A 2v1 still reads as one side against another rather than as a flat list of three
 * names that says nothing about who is allied with whom.
 */
export function TableStrip({ sides }: { sides: Side[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {sides.map((side, position) => (
        <Fragment key={side.index}>
          {position ? <span className="text-xs font-bold tracking-[0.14em] text-faint uppercase">versus</span> : null}
          <SidePlayers side={side} />
        </Fragment>
      ))}
    </div>
  )
}
