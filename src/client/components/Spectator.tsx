import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Eye } from 'lucide-react'
import posthog from 'posthog-js'
import { useEffect, useMemo, useRef } from 'react'
import type { Command } from '../../core/battle'
import type { ReportEntry } from '../../core/battleReport'
import type { BattleView } from '../../core/battleView'
import { battleOutcome } from '../battleOutcome'
import { battleStage } from '../battleStage'
import { missionCardsByKey } from '../missionDeck'
import { deploymentsQuery, gameReferencesQuery, meQuery } from '../queries'
import { sides, type Side, type SideMission } from '../sides'
import { ArmyIdentity } from './ArmyIdentity'
import { PlayerName } from './PlayerName'
import { Report, type ReportPlayer } from './Report'
import { ArmyRoster } from './battle/ArmyRoster'
import { PrimaryMission, type ReferenceCard, SecondaryMissions } from './battle/MissionCards'
import { Scoreboard } from './battle/Scoreboard'
import { HEADING, tint } from './battle/tints'

type Props = {
  view: BattleView
  missions: { side: number; mission: SideMission | null }[]
  report: readonly ReportEntry[]
}

const ignoreCommand = (_command: Command) => {}
const noAwards = () => []

export function Spectator({ view, missions, report }: Props) {
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
    <main className="w-full space-y-3 px-3 pb-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 pt-3">
        {view.leagueToken ? (
          <Link
            to="/leagues/$token"
            params={{ token: view.leagueToken }}
            search={view.leagueEventToken ? { event: view.leagueEventToken } : {}}
            className="inline-flex items-center gap-1.5 text-sm text-info hover:text-bone"
          >
            <ArrowLeft className="size-4" /> Back to league event
          </Link>
        ) : null}
        <span className="flex flex-wrap items-center gap-3">
          {/*
            A watchable battle opens for anybody, including the two people playing
            it, so a seated player who has been signed out arrives here rather than
            at a sign-in gate. Watching their own game with no way back into it is
            the one thing this screen must not do.
          */}
          {me ? null : (
            <span className="text-xs text-dim">
              Playing in this battle?{' '}
              <Link to="/sign-in" search={{ next: `/battles/${view.token}` }} className="text-info hover:text-bone">
                Sign in
              </Link>
            </span>
          )}
          <span className={`chip inline-flex items-center gap-1.5 ${battleStage(view.status).tint}`}>
            <Eye className="size-3.5" />{' '}
            {view.status === 'finished' ? 'Battle replay' : view.status === 'playing' ? 'Watching live' : 'Battle setup'}
          </span>
        </span>
      </div>

      <Scoreboard view={view} sides={table} outcome={view.status === 'finished' ? battleOutcome(table, view) : null} />

      <div className="mx-auto grid max-w-7xl items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)_minmax(0,1fr)]">
        {table.map((side) => (
          <SpectatorSide
            key={side.index}
            view={view}
            side={side}
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
            <p className={HEADING}>Battle events</p>
            <Report token={view.token} open players={reportPlayers} entries={report} />
          </div>
        </section>
      </div>
    </main>
  )
}

function SpectatorSide({
  view,
  side,
  referenceFor,
  className,
}: {
  view: BattleView
  side: Side
  referenceFor: (key: string) => ReferenceCard | undefined
  className: string
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
            <ArmyRoster army={army} side={side} token={view.token} actionable={false} send={ignoreCommand} />
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
          <p className={HEADING}>Stratagems used</p>
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
      <dt className={HEADING}>{label}</dt>
      <dd className="truncate text-bone">{value}</dd>
    </div>
  )
}
