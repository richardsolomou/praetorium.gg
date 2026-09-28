import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { posthog } from 'posthog-js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Command } from '../../../core/battle'
import type { ReportEntry } from '../../../core/battleReport'
import type { ReplayPoint } from '../../../core/battleReplay'
import type { BattleView } from '../../../core/battleView'
import { battleOutcome } from '../../battleOutcome'
import { missionCardsByKey } from './missionDeck'
import { deploymentsQuery, gameReferencesQuery, meQuery } from '../../queries'
import { sides, type Side, type SideMission } from '../../sides'
import { ArmyIdentity } from './ArmyIdentity'
import { PlayerName } from './PlayerName'
import { Report, type ReportPlayer } from './Report'
import { BattleCombatDialog, type BattleCombatSelection } from '../simulator/BattleCombatDialog'
import { ArmyRoster } from './ArmyRoster'
import { PrimaryMission, type ReferenceCard, SecondaryMissions } from './MissionCards'
import { Scoreboard } from './Scoreboard'
import { tint } from './battleTints'
import { Button } from '@/components/ui/button'
import { replayAtQuery } from '../../queries'

type Props = {
  view: BattleView
  missions: { side: number; mission: SideMission | null }[]
  report?: readonly ReportEntry[]
  onExit?: () => void
  timeline?: readonly ReplayPoint[]
}

const ignoreCommand = (_command: Command) => {}
const noAwards = () => []
const emptyTimeline: readonly ReplayPoint[] = []

export function Spectator({
  view: currentView,
  missions: currentMissions,
  report: currentReport,
  onExit,
  timeline = emptyTimeline,
}: Props) {
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null)
  const seq = selectedSeq ?? timeline.at(-1)?.seq ?? currentView.seq
  const selectedIndex = Math.max(
    0,
    timeline.findIndex((point) => point.seq === seq),
  )
  const queryClient = useQueryClient()
  const replay = useQuery(replayAtQuery(currentView.token, seq, currentView.status === 'finished' && seq < currentView.seq))
  useEffect(() => {
    if (currentView.status !== 'finished') return
    for (const neighbor of [timeline[selectedIndex - 1], timeline[selectedIndex + 1]]) {
      if (neighbor && neighbor.seq < currentView.seq)
        void queryClient.query(replayAtQuery(currentView.token, neighbor.seq, true)).catch(() => {})
    }
  }, [currentView.seq, currentView.status, currentView.token, queryClient, selectedIndex, timeline])
  const frame = seq < currentView.seq && replay.data?.kind === 'replay' ? replay.data : null
  const view = frame?.view ?? currentView
  const missions = frame?.missions ?? currentMissions
  const report = frame?.report ?? currentReport
  const [combatSelection, setCombatSelection] = useState<BattleCombatSelection | null>(null)
  const table = useMemo(() => sides(view, missions), [missions, view])
  const { data: me } = useQuery(meQuery())
  const { data: deployments } = useQuery(deploymentsQuery())
  const { data: references } = useQuery(gameReferencesQuery())
  const deployment = deployments?.find((entry) => entry.id === view.deploymentId)
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
    if (captured.current) return
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
  }, [table, view.leagueToken, view.players.length, view.status, view.token])

  return (
    <>
      <main className="w-full space-y-3 px-3 pb-40">
        <div className="mx-auto flex h-11 max-w-7xl items-center justify-between gap-3 pt-1">
          <p className="eyebrow shrink-0">
            {currentView.status === 'finished' ? 'Battle replay' : view.status === 'playing' ? 'Watching live' : 'Battle setup'}
          </p>
          <div className="flex min-w-0 items-center gap-2 text-xs">
            {onExit ? (
              <Button variant="outline" size="sm" onClick={onExit}>
                Back to battle
              </Button>
            ) : view.leagueToken ? (
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
              <Link to="/sign-in" search={{ next: `/battles/${view.token}` }} className="shrink-0 text-info hover:text-bone">
                Sign in to play
              </Link>
            ) : null}
          </div>
        </div>

        {combatSelection ? <BattleCombatDialog view={view} selection={combatSelection} onClose={() => setCombatSelection(null)} /> : null}
        <Scoreboard
          view={view}
          sides={table}
          outcome={view.status === 'finished' ? battleOutcome(table, view) : null}
          replay={currentView.status === 'finished'}
        />

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
              <Fact label="Battlefield" value={deployment?.name ?? 'Not chosen'} />
              <Fact label="Attacker" value={view.players.find((player) => player.id === view.attackerId)?.name ?? 'Not chosen'} />
              <Fact label="Battle size" value={view.settings.limit ? `${view.settings.limit} points` : 'Legacy format'} />
            </dl>
            <div className="border-t border-edge pt-3">
              <p className="eyebrow">Battle events</p>
              <Report token={view.token} open players={reportPlayers} entries={report} />
            </div>
          </section>
        </div>
      </main>
      {currentView.status === 'finished' ? (
        <ReplayTimeline
          points={timeline}
          index={selectedIndex}
          onSelect={setSelectedSeq}
          loading={replay.isFetching}
          error={replay.isError || replay.data?.kind === 'unavailable'}
        />
      ) : null}
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
  const rounds = [...new Set(points.map((point) => point.round).filter((round) => round > 0))]
  const choose = (next: number) => onSelect(points[next]!.seq)
  const bucketSize = Math.max(1, Math.ceil(points.length / 100))
  const bars = Array.from({ length: Math.ceil(points.length / bucketSize) }, (_, bucket) =>
    points.slice(bucket * bucketSize, (bucket + 1) * bucketSize),
  )
  return (
    <nav
      data-replay-timeline
      aria-label="Battle replay timeline"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-panel/95 px-3 py-2 shadow-xl backdrop-blur"
    >
      <div className="mx-auto max-w-3xl space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="eyebrow shrink-0">Battle timeline</p>
          {loading ? <span className="text-3xs text-dim">Loading…</span> : null}
          {error ? <span className="text-3xs text-destructive">Could not load</span> : null}
          <p className="min-w-0 flex-1 truncate text-center text-xs text-bone" aria-live="polite">
            {selected.text}
          </p>
          <p className="readout shrink-0 text-xs text-dim">
            {index + 1}/{points.length}
          </p>
        </div>
        <div className="relative h-10">
          <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-8 items-end gap-px border-b border-edge">
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
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
            style={{ left: `${(index / Math.max(1, points.length - 1)) * 100}%` }}
          />
          <input
            type="range"
            min={0}
            max={points.length - 1}
            step={1}
            value={index}
            onChange={(event) => choose(Number(event.target.value))}
            aria-label="Replay event"
            aria-valuetext={`Event ${index + 1} of ${points.length}: ${selected.text}`}
            className="absolute inset-0 z-10 h-10 w-full cursor-ew-resize opacity-0"
          />
        </div>
        <div className="relative h-5 text-xs">
          {rounds.map((round) => {
            const position = points.findIndex((point) => point.round === round)
            return (
              <button
                key={round}
                type="button"
                aria-label={`Round ${round}`}
                className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${selected.round === round ? 'text-parchment' : 'text-dim hover:text-bone'}`}
                style={{ left: `${Math.max(7, Math.min(93, (position / Math.max(1, points.length - 1)) * 100))}%` }}
                onClick={() => choose(position)}
              >
                R{round}
              </button>
            )
          })}
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
            <ArmyIdentity army={army} token={view.token} className="mt-0.5" />
            <ArmyRoster onSimulate={onSimulate} army={army} side={side} token={view.token} actionable={false} send={ignoreCommand} />
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="truncate text-bone">{value}</dd>
    </div>
  )
}
