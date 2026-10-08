import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Command } from '../../../core/battle'
import type { BattleClock } from '../../../core/battleClock'
import type { ReportEntry } from '../../../core/battleReport'
import type { ReplayPoint } from '../../../core/battleReplay'
import { expandReplayFrames } from '../../../core/replayFrames'
import type { BattleView } from '../../../core/battleView'
import { replayBattleBatch } from '../../../server/functions'
import { battleOutcome } from '../../battleOutcome'
import { deploymentFor } from '../../battleSummary'
import { replayPreloadBatches } from '../../replayPrefetch'
import { missionCardsByKey } from './missionDeck'
import { deploymentsQuery, gameReferencesQuery, meQuery, replayAtQuery } from '../../queries'
import { sides, type Side, type SideMission } from '../../sides'
import { ArmyIdentity } from './ArmyIdentity'
import { PlayerName } from './PlayerName'
import { Report, type ReportPlayer } from './Report'
import { BattleCombatDialog, type BattleCombatSelection } from '../simulator/BattleCombatDialog'
import { ArmyRoster } from './ArmyRoster'
import { PrimaryMission, type ReferenceCard, SecondaryMissions } from './MissionCards'
import { Scoreboard } from './Scoreboard'
import { TurnTimes } from './TurnTimes'
import { tint } from './battleTints'
import { Fact } from '../../components/Fact'
import { BattlefieldFact } from './BattlefieldFact'
import { SpectatorInvite } from './SpectatorInvite'

type Props = {
  view: BattleView
  clock: BattleClock
  missions: { side: number; mission: SideMission | null }[]
  report?: readonly ReportEntry[]
  timeline?: readonly ReplayPoint[]
}

const ignoreCommand = (_command: Command) => {}
const noAwards = () => []
const emptyTimeline: readonly ReplayPoint[] = []

export function Spectator({
  view: currentView,
  clock: currentClock,
  missions: currentMissions,
  report: currentReport,
  timeline = emptyTimeline,
}: Props) {
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null)
  const seq = selectedSeq ?? timeline.at(-1)?.seq ?? currentView.seq
  const selectedIndex = Math.max(
    0,
    timeline.findIndex((point) => point.seq === seq),
  )
  const queryClient = useQueryClient()
  const replay = useQuery(replayAtQuery(currentView.token, seq, seq < currentView.seq))
  useEffect(() => () => queryClient.removeQueries({ queryKey: ['battle-replay', currentView.token] }), [currentView.token, queryClient])
  useEffect(() => {
    let active = true
    void (async () => {
      for (const batch of replayPreloadBatches(timeline, currentView.seq)) {
        if (!active) return
        const missing = batch.filter(
          (nextSeq) => queryClient.getQueryData(replayAtQuery(currentView.token, nextSeq, true).queryKey) === undefined,
        )
        if (!missing.length) continue
        try {
          const result = await replayBattleBatch({ data: { token: currentView.token, seqs: missing } })
          if (!active || result.kind === 'unavailable') return
          const frames = expandReplayFrames(result.first, result.deltas)
          if (frames.length !== missing.length) return
          for (const [index, frame] of frames.entries()) {
            queryClient.setQueryData(replayAtQuery(currentView.token, missing[index]!, true).queryKey, frame)
          }
        } catch {
          return
        }
      }
    })()
    return () => {
      active = false
    }
  }, [currentView.seq, currentView.token, queryClient, timeline])
  const frame = seq < currentView.seq && replay.data?.kind === 'replay' ? replay.data : null
  const view = frame?.view ?? currentView
  const clock = frame?.clock ?? currentClock
  const missions = frame?.missions ?? currentMissions
  const report = frame?.report ?? currentReport
  const [combatSelection, setCombatSelection] = useState<BattleCombatSelection | null>(null)
  const table = useMemo(() => sides(view, missions), [missions, view])
  const { data: me } = useQuery(meQuery())
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const deployment = deploymentFor(view.deploymentId, deployments)
  const missionPack = references?.packs.find((entry) => entry.id === view.settings.missionPackId)
  const cardsByKey = useMemo(() => missionCardsByKey(references), [references])
  const referenceFor = (key: string) => cardsByKey.get(key)
  const captured = useRef(false)
  const reportPlayers: ReportPlayer[] = view.players.map((player) => ({
    id: player.id,
    name: player.name,
    className: player.side === 0 ? 'text-side-a' : 'text-side-b',
  }))

  useEffect(() => {
    if (captured.current || view.players.some((player) => player.isViewer)) return
    captured.current = true
    posthog.capture('battle_spectated', {
      status: view.status,
      format: table
        .map((side) => side.armies.length)
        .toSorted((left, right) => right - left)
        .join('v'),
      player_count: view.players.length,
      league: Boolean(view.leagueToken),
    })
  }, [table, view.leagueToken, view.players, view.status, view.token])

  return (
    <>
      <main className="w-full space-y-2 px-3 pb-28">
        <div className="mx-auto flex h-8 max-w-7xl items-center justify-between gap-3">
          <p className="eyebrow shrink-0">
            {currentView.status === 'finished' ? 'Battle replay' : view.status === 'playing' ? 'Watching live' : 'Battle setup'}
          </p>
          <div className="flex min-w-0 items-center gap-2 text-xs">
            {view.leagueToken ? (
              <Link
                to="/leagues/$token"
                params={{ token: view.leagueToken }}
                search={view.leagueEventToken ? { event: view.leagueEventToken } : {}}
                className="inline-flex shrink-0 items-center gap-1 text-info hover:text-bone"
              >
                <ArrowLeft className="size-3.5" /> League event
              </Link>
            ) : null}
            {!me ? (
              <Link to="/sign-in" search={{ next: `/battles/${view.token}` }} rel="nofollow" className="shrink-0 text-info hover:text-bone">
                Sign in to play
              </Link>
            ) : null}
          </div>
        </div>

        {combatSelection ? <BattleCombatDialog view={view} selection={combatSelection} onClose={() => setCombatSelection(null)} /> : null}
        <Scoreboard view={view} clock={clock} sides={table} outcome={view.status === 'finished' ? battleOutcome(table, view) : null} />
        {/* A finished game is when a reader is most likely to want their own, so it leads there and waits beside the facts while play goes on. */}
        {currentView.status === 'finished' ? (
          <SpectatorInvite view={currentView} className="mx-auto max-w-7xl rounded-lg border border-primary/40 bg-panel p-3" />
        ) : null}

        <div className="mx-auto grid max-w-7xl items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)_minmax(0,1fr)]">
          {table.map((side) => (
            <SpectatorSide
              key={side.index}
              view={view}
              side={side}
              onSimulate={setCombatSelection}
              referenceFor={referenceFor}
              className={side.index === 0 ? 'lg:col-start-1' : 'lg:col-start-3 lg:row-start-1'}
            />
          ))}

          <section className="min-w-0 space-y-3 rounded-lg border border-edge bg-panel p-3 lg:col-start-2 lg:row-start-1">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <Fact label="Mission pack" value={missionPack?.name ?? 'Not chosen'} />
              <BattlefieldFact view={view} deployment={deployment} />
              <Fact label="Attacker" value={view.players.find((player) => player.id === view.attackerId)?.name ?? 'Not chosen'} />
              <Fact label="Battle size" value={view.settings.limit ? `${view.settings.limit} points` : 'Legacy format'} />
            </dl>
            {currentView.status === 'finished' ? null : <SpectatorInvite view={currentView} className="border-t border-edge pt-3" />}
            {/* A review of the whole game, so it waits for the game to end rather than crowding a live one. */}
            {currentView.status === 'finished' ? (
              <div className="border-t border-edge pt-3">
                <TurnTimes clock={clock} sides={table} />
              </div>
            ) : null}
            <div className="border-t border-edge pt-3">
              <p className="eyebrow">Battle events</p>
              <Report token={view.token} open players={reportPlayers} entries={report} />
            </div>
          </section>
        </div>
      </main>
      {/* The latest event is not pinned, so a live battle keeps following new events until someone scrubs back. */}
      <ReplayTimeline
        points={timeline}
        index={selectedIndex}
        onSelect={(next) => setSelectedSeq(next === timeline.at(-1)?.seq ? null : next)}
        loading={replay.isFetching}
        error={replay.isError || replay.data?.kind === 'unavailable'}
      />
    </>
  )
}

function ReplayTimeline({
  points,
  index,
  onSelect,
  loading,
  error,
}: {
  points: readonly ReplayPoint[]
  index: number
  onSelect: (seq: number) => void
  loading: boolean
  error: boolean
}) {
  if (!points.length) return null
  const selected = points[index]!
  const roundStarts = [...new Set(points.map((point) => point.round).filter((round) => round > 0))].map((round) => ({
    round,
    position: points.findIndex((point) => point.round === round),
  }))
  const roundName = selected.round > 0 ? `Round ${selected.round}` : 'Setup'
  const choose = (next: number) => onSelect(points[next]!.seq)
  const chooseAt = (clientX: number, input: HTMLInputElement) => {
    const bounds = input.getBoundingClientRect()
    const next = Math.round(((clientX - bounds.left) / bounds.width) * (points.length - 1))
    choose(Math.max(0, Math.min(points.length - 1, next)))
  }
  const bucketSize = Math.max(1, Math.ceil(points.length / 100))
  const bars = Array.from({ length: Math.ceil(points.length / bucketSize) }, (_, bucket) =>
    points.slice(bucket * bucketSize, (bucket + 1) * bucketSize),
  )
  return (
    <nav
      data-replay-timeline
      aria-label="Battle replay timeline"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-panel/95 px-3 py-1.5 shadow-xl backdrop-blur"
    >
      <div className="mx-auto max-w-3xl space-y-1">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <p className="eyebrow shrink-0">Battle timeline</p>
            {loading ? <span className="truncate text-3xs text-dim">Loading…</span> : null}
            {error ? <span className="truncate text-3xs text-destructive">Could not load</span> : null}
          </div>
          <p className="text-xs font-semibold text-parchment">{selected.round > 0 ? `Round ${selected.round}` : 'Setup'}</p>
          <p className="readout justify-self-end text-xs text-dim">
            {index + 1}/{points.length}
          </p>
        </div>
        <div className="relative h-8">
          <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-5 items-end gap-px border-b border-edge">
            {bars.map((bar, bucket) => {
              const active = bar.some((point) => point.activity === 'action')
              const reached = bucket * bucketSize <= index
              return (
                <span
                  key={bar[0]!.seq}
                  className={`min-w-0 flex-1 ${reached ? 'bg-parchment' : 'bg-faint'}`}
                  style={{ height: active ? '85%' : '35%' }}
                />
              )
            })}
          </div>
          {/* Taller than the bars, so a round start stands out from the gaps between events. */}
          {roundStarts.map(({ round, position }) => (
            <span
              key={round}
              aria-hidden
              data-round-start={round}
              className="pointer-events-none absolute bottom-0 h-6 w-px bg-dim"
              style={{ left: `${(Math.floor(position / bucketSize) / bars.length) * 100}%` }}
            />
          ))}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-6 w-px bg-primary"
            style={{ left: `${(index / Math.max(1, points.length - 1)) * 100}%` }}
          />
          <input
            type="range"
            min={0}
            max={points.length - 1}
            step={1}
            value={index}
            onChange={(event) => choose(Number(event.target.value))}
            onPointerDown={(event) => {
              event.preventDefault()
              event.currentTarget.focus()
              event.currentTarget.setPointerCapture(event.pointerId)
              chooseAt(event.clientX, event.currentTarget)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) chooseAt(event.clientX, event.currentTarget)
            }}
            aria-label="Replay event"
            aria-valuetext={`${roundName}, event ${index + 1} of ${points.length}: ${selected.text}`}
            className="absolute inset-x-0 -top-1.5 z-10 h-11 w-full cursor-ew-resize touch-none opacity-0"
          />
        </div>
      </div>
    </nav>
  )
}

function SpectatorSide({
  view,
  side,
  referenceFor,
  onSimulate,
  className,
}: {
  view: BattleView
  side: Side
  referenceFor: (key: string) => ReferenceCard | undefined
  className: string
  onSimulate: (selection: BattleCombatSelection) => void
}) {
  const colours = tint(side.index)
  const guides = {
    primary: side.mission?.gameCap ?? view.guides.primary,
    secondary: side.mission?.secondaryGameCap ?? view.guides.secondary,
  }
  const cardProps = {
    view,
    side,
    actionable: false,
    pending: false,
    send: ignoreCommand,
    awardsFor: noAwards,
    referenceFor,
    guides,
  }

  return (
    <section className={`min-w-0 space-y-3 rounded-lg border border-edge border-t-2 bg-panel p-3 ${colours.edge} ${className}`}>
      <div className="space-y-2">
        {side.armies.map((army) => (
          <div key={army.playerId} className="min-w-0">
            <h2 className={`text-lg leading-tight font-bold uppercase ${colours.text}`}>
              <PlayerName army={army} />
            </h2>
            <ArmyIdentity army={army} list={false} className="mt-0.5" />
            <ArmyRoster onSimulate={onSimulate} army={army} side={side} actionable={false} pending={false} send={ignoreCommand} />
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-2 border-y border-edge py-2">
        <Fact label="Victory points" value={`${side.total}`} />
        <Fact label="Command points" value={`${side.cp}`} />
      </dl>
      <PrimaryMission {...cardProps} />
      <SecondaryMissions {...cardProps} />
      {side.stratagems.some((stratagem) => stratagem.uses > 0) ? (
        <div>
          <p className="eyebrow">Stratagems used</p>
          <ul className="mt-1 space-y-1 text-xs text-dim">
            {side.stratagems
              .filter((stratagem) => stratagem.uses > 0)
              .map((stratagem) => (
                <li key={stratagem.key} className="flex justify-between gap-2">
                  <span className="text-bone">{stratagem.name}</span>
                  <span className="readout">{stratagem.uses}×</span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
