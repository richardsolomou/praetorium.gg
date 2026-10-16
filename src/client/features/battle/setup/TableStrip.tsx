import { Fragment } from 'react'
import type { Side } from '../../../sides'
import { SidePlayers } from '../PlayerName'
import { tint } from '../battleTints'
import { useDispositionNames } from './chrome'

/**
 * Who is playing whom, as two tiles facing each other above setup.
 *
 * Each tile names the side, the armies it brought and, once both are in, the
 * disposition and primary it plays, and takes the reader to the step that settles
 * whatever the tile is still missing.
 */
export function TableStrip({ sides }: { sides: Side[] }) {
  const nameDisposition = useDispositionNames()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
      {sides.map((side, position) => {
        const armies = side.armies.flatMap((army) => (army.roster ? [army.roster.name] : []))
        const disposition = nameDisposition(side.disposition)?.name
        const end = position > 0
        return (
          <Fragment key={side.index}>
            {position ? <span className="grid place-items-center px-1 text-sm font-bold text-dim">VS</span> : null}
            <a
              href={side.mission ? '#setup-mission' : '#setup-armies'}
              className={`flex min-h-16 min-w-0 flex-col justify-center gap-0.5 border border-edge border-t-[3px] bg-panel px-3 py-2 transition-colors hover:border-info hover:bg-raised focus-visible:ring-2 focus-visible:ring-info focus-visible:outline-none sm:px-4 ${tint(side.index).edge} ${end ? 'items-end text-right' : 'items-start text-left'}`}
            >
              <SidePlayers side={side} linked={false} className={end ? 'justify-end' : ''} />
              <span className="max-w-full truncate text-xs text-dim">{armies.length ? armies.join(' & ') : 'No army chosen'}</span>
              {side.mission ? (
                <>
                  {disposition ? <span className="eyebrow mt-1 text-bone/75">{disposition}</span> : null}
                  <span className="font-bold break-words sm:text-lg">{side.mission.name}</span>
                </>
              ) : null}
            </a>
          </Fragment>
        )
      })}
    </div>
  )
}
