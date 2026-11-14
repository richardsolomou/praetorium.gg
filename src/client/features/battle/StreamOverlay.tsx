import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useRef } from 'react'
import type { BattleView } from '../../../core/battleView'
import { captureWhenLoaded } from '../../../posthog'
import { battleResult } from '../../battleOutcome'
import { battleQuery, factionQuery } from '../../queries'
import { formatName, sideName, sides, type Army, type Side, type SideMission } from '../../sides'
import { useSpacetimeLiveBattle } from '../../spacetimeLive'
import { tint } from './battleTints'
import { PaintedBattle, PlayerTint } from './battleColours'

/**
 * The score strip a streaming tool lays over its video: what a spectator sees, without the app around it.
 */
export function StreamOverlay({ token }: { token: string }) {
  const { data: screen, isPending } = useQuery(battleQuery(token))
  useSpacetimeLiveBattle(token)
  if (isPending) return null
  if (!screen || screen.kind === 'unavailable')
    return (
      <main className="p-3">
        <p className="mx-auto w-fit rounded-lg bg-void/90 px-3 py-2 text-sm text-dim">This battle is not open to watch.</p>
      </main>
    )
  return <OverlayStrip view={screen.view} missions={screen.missions} />
}

function OverlayStrip({ view, missions }: { view: BattleView; missions: readonly { side: number; mission: SideMission | null }[] }) {
  const table = useMemo(() => sides(view, missions), [missions, view])
  const viewed = useRef(false)
  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    captureWhenLoaded('battle_overlay_viewed', {
      status: view.status,
      format: formatName(table),
      player_count: view.players.length,
      seated: view.players.some((player) => player.isViewer),
    })
  }, [table, view.players, view.status])
  const [first, second] = table
  return (
    <PaintedBattle players={view.players}>
      <main className="p-3">
        <section
          aria-label="Battle score"
          className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-4 rounded-xl border border-edge bg-void/90 px-4 py-3"
        >
          {first ? <OverlaySide view={view} side={first} align="start" /> : <div />}
          <OverlayStatus view={view} table={table} />
          {second ? <OverlaySide view={view} side={second} align="end" /> : <div />}
        </section>
      </main>
    </PaintedBattle>
  )
}

function OverlayStatus({ view, table }: { view: BattleView; table: Side[] }) {
  if (view.status === 'setup') return <p className="self-center text-sm font-bold text-dim uppercase">Setting up</p>
  if (view.status === 'finished') {
    const result = battleResult(table, view)
    return (
      <div className="self-center text-center">
        <p className="text-base leading-tight font-bold uppercase">
          {result.kind === 'win' ? (
            <>
              <span className={tint(result.side.index).text}>{sideName(result.side)}</span> <span className="text-dim">{result.verb}</span>
            </>
          ) : (
            result.detail
          )}
        </p>
        {result.kind !== 'win' ? null : result.score ? (
          <p className="figure text-2xl leading-none font-bold">{result.score}</p>
        ) : (
          <p className="text-sm text-dim">{result.detail}</p>
        )}
      </div>
    )
  }
  const active = view.players.find((player) => player.isActive)
  return (
    <div className="self-center text-center">
      <p className="font-display text-xs font-semibold tracking-label text-dim uppercase">
        Round <span className="figure text-base font-bold text-bone">{view.round}</span> of {view.rounds}
      </p>
      <p className="text-sm leading-tight font-bold uppercase">{view.phase} phase</p>
      <p className={cn('text-xs leading-tight font-semibold', active ? tint(active.side).text : 'text-dim')}>
        {active ? `${active.name}’s turn` : 'Nobody’s turn'}
      </p>
    </div>
  )
}

function OverlaySide({ view, side, align }: { view: BattleView; side: Side; align: 'start' | 'end' }) {
  const colours = tint(side.index)
  const end = align === 'end'
  // A seated player who opens their own overlay still sees their secret mission named; the stream must not.
  const cards = side.secondaries
    .filter((card) => card.status === 'active')
    .map((card) => ({ key: card.key, name: card.secret && !card.revealed ? 'Secret mission' : card.name }))
  return (
    <div className={cn('min-w-0 space-y-1.5', end && 'text-right')}>
      <div>
        <p className={cn('truncate text-lg leading-tight font-bold uppercase', colours.text)}>
          {side.armies.map((army, index) => (
            <span key={army.playerId}>
              {index ? ' & ' : null}
              <PlayerTint playerId={army.playerId}>{army.playerName}</PlayerTint>
            </span>
          ))}
        </p>
        <p className="truncate text-xs text-dim">
          {side.armies.map((army, index) => (
            <span key={army.playerId}>
              {index ? ' & ' : null}
              <FactionName army={army} />
            </span>
          ))}
        </p>
      </div>
      <dl className={cn('flex gap-4', end && 'justify-end')}>
        <div>
          <dt className="eyebrow">VP</dt>
          <dd key={side.total} className="figure animate-figure text-4xl leading-none font-bold">
            {side.total}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">CP</dt>
          <dd key={side.cp} className={cn('figure animate-figure text-4xl leading-none font-bold', colours.text)}>
            {side.cp}
          </dd>
        </div>
      </dl>
      {view.settings.manual || !cards.length ? null : (
        <ul aria-label="Secondary missions" className={cn('flex flex-wrap gap-1', end && 'justify-end')}>
          {cards.map((card) => (
            <li key={card.key} className="chip text-xs text-bone">
              {card.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FactionName({ army }: { army: Army }) {
  const catalogueId = army.roster?.built?.catalogueId ?? ''
  const { data } = useQuery({ ...factionQuery(catalogueId), enabled: Boolean(catalogueId) })
  return <>{data?.displayName ?? 'No army yet'}</>
}
