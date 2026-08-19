import { type Side, sideName } from '../../sides'
import { tint } from '../battle/tints'

/**
 * Who is playing whom, drawn the way the tracker will draw it.
 *
 * A 2v1 reads as one side against another from the first screen rather than as a
 * flat list of three names that says nothing about who is allied with whom.
 */
export function TableStrip({ sides, solo }: { sides: Side[]; solo: boolean }) {
  return (
    <div className="grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {sides.map((side, position) => (
        <div key={side.index} className={position === 0 ? 'order-1' : 'order-3'}>
          <SideCard side={side} />
        </div>
      ))}
      <p className="order-2 self-center text-center text-xs font-bold tracking-[0.14em] text-faint uppercase">
        {solo ? 'practice' : 'versus'}
      </p>
    </div>
  )
}

function SideCard({ side }: { side: Side }) {
  const colours = tint(side.index)
  return (
    <section className={`h-full rounded-sm border border-edge border-t-2 bg-panel p-3 ${colours.edge}`}>
      <p className={`truncate text-sm leading-tight font-bold uppercase ${colours.text}`}>
        {sideName(side)}
        {side.isViewer ? <span className="ml-1.5 text-[0.625rem] font-normal normal-case text-dim">&nbsp;you</span> : null}
      </p>
      <ul className="mt-1.5 space-y-1">
        {side.armies.map((army) => (
          <li key={army.playerId} className="flex items-baseline justify-between gap-2 text-xs">
            <span className={`min-w-0 truncate ${army.roster ? 'text-bone' : 'text-faint'}`}>{army.roster?.name ?? 'No army chosen'}</span>
            <span className={`readout shrink-0 text-[0.625rem] ${army.roster ? 'text-dim' : 'text-faint'}`}>
              {army.points === null ? (army.roster ? 'ready' : 'waiting') : `${army.points} pts`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
