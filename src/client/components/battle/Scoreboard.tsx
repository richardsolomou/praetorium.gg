import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { BattleView } from '../../../core/battle'
import type { Army, Side } from '../../sides'
import { tint } from './tints'

type Props = { view: BattleView; sides: Side[]; outcome: string | null; menu: ReactNode }

/**
 * The one line worth glancing at mid-turn: who is ahead, whose turn it is, and how
 * far through the battle everyone is. The same component at every width, so a phone
 * and a laptop never disagree about the score.
 */
export function Scoreboard({ view, sides, outcome, menu }: Props) {
  const active = view.players.find((player) => player.isActive)
  const finished = view.status === 'finished'

  return (
    <section
      data-scoreboard
      aria-label="Battle scoreboard"
      className="sticky top-12 z-20 -mx-3 border-b border-edge bg-void/95 px-3 py-2 backdrop-blur"
    >
      <div
        className={`mx-auto grid items-center gap-3 sm:gap-6 ${
          sides.length > 1 ? 'max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' : 'max-w-3xl grid-cols-[minmax(0,1fr)_auto]'
        }`}
      >
        {sides.map((side, position) => (
          <SideScore key={side.index} side={side} round={view.round} token={view.token} align={position === 0 ? 'start' : 'end'} />
        ))}
        <div className="order-2 flex items-center gap-2 text-center">
          <div className="min-w-28">
            {finished ? (
              <>
                <p className="eyebrow">Result</p>
                <h1 className="text-sm leading-tight font-bold text-balance uppercase">{outcome}</h1>
              </>
            ) : (
              <>
                <p className="eyebrow">
                  Round{' '}
                  <span data-stat="round" className="readout text-bone">
                    {view.round}
                  </span>{' '}
                  of {view.rounds}
                </p>
                <h1 className="text-sm leading-tight font-bold uppercase sm:text-base">{view.phase} phase</h1>
                <p className="truncate text-[0.6875rem] text-dim">{active ? `${active.name}’s turn` : 'Nobody’s turn'}</p>
              </>
            )}
          </div>
          {menu}
        </div>
      </div>
    </section>
  )
}

function SideScore({ side, round, token, align }: { side: Side; round: number; token: string; align: 'start' | 'end' }) {
  const colours = tint(side.index)
  const end = align === 'end'
  return (
    <div data-side-score={side.index} className={`min-w-0 ${end ? 'order-3' : 'order-1'}`}>
      {/* Capped, or the round strip stretches across a wide column and stops reading as five rounds. */}
      <div className={`min-w-0 max-w-64 ${end ? 'ml-auto text-right' : ''}`}>
        <p className={`truncate text-sm leading-tight font-bold uppercase ${colours.text}`}>
          {side.armies.map((army, at) => (
            <span key={army.playerId}>
              {at ? <span className="text-dim"> & </span> : null}
              <Link to="/players/$playerId" params={{ playerId: army.playerId }} className="hover:underline">
                {army.playerName}
              </Link>
            </span>
          ))}
          {side.isViewer ? <span className="ml-1.5 text-[0.625rem] font-normal normal-case text-dim">&nbsp;you</span> : null}
        </p>
        <p className="truncate text-[0.6875rem] text-dim">
          {side.armies.map((army, at) => (
            <span key={army.playerId}>
              {at ? ' · ' : null}
              <ArmyLink army={army} token={token} />
            </span>
          ))}
        </p>
        <p className={`readout mt-0.5 flex items-baseline gap-1.5 ${end ? 'justify-end' : ''}`}>
          <span className="text-2xl leading-none font-bold sm:text-3xl">{side.total}</span>
          <span className="text-[0.625rem] text-dim uppercase">vp</span>
          <span className={`ml-1 text-base leading-none font-bold ${colours.text}`}>{side.cp}</span>
          <span className="text-[0.625rem] text-dim uppercase">cp</span>
        </p>
        <div className={`mt-1 flex gap-0.5 ${end ? 'flex-row-reverse' : ''}`} aria-hidden>
          {side.rounds.map((entry) => (
            <span key={entry.round} className={`h-1 flex-1 ${entry.round <= round ? colours.rail : 'bg-edge-strong'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** The list itself, when the battle knows which saved list it was. */
function ArmyLink({ army, token }: { army: Army; token: string }) {
  if (!army.roster) return <span className="text-faint">No list</span>
  if (!army.rosterId) return <span>{army.roster.name}</span>
  return (
    <Link to="/rosters/$id" params={{ id: army.rosterId }} search={{ battle: token }} className="hover:underline">
      {army.roster.name}
    </Link>
  )
}
