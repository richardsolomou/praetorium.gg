import { useMutation } from '@tanstack/react-query'
import { Check, LogOut, UserPlus, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  currentSquadStage,
  SQUAD_NAME_MAX_LENGTH,
  squadPairing,
  squadStepChoices,
  squadStepCount,
  type SquadPairingState,
} from '../../../core/squad'
import { ScoreFigure } from '../../components/ScoreFigure'
import { Problem } from '../../components/Problem'
import { pickSquad, setSquad } from '../../functions'
import { countLabel } from '../../text'
import { OUTLINE_TAG } from '../../components/rosterSetup'
import { useSealedEventRefresh, type SealedEvent } from './sealedEvent'

type SquadMatch = SealedEvent['squadMatches'][number]

/** A player's way to start a team before the reveal, shown until they are on one. */
export function StartSquad({ token, sealedEvent }: { token: string; sealedEvent: SealedEvent }) {
  const refresh = useSealedEventRefresh(token)
  const [name, setName] = useState('')
  const start = useMutation({
    mutationFn: () => setSquad({ data: { token, eventToken: sealedEvent.eventToken, squad: { name } } }),
    onSuccess: async () => {
      setName('')
      await refresh()
    },
  })
  return (
    <section data-start-squad className="space-y-3 part p-4 sm:p-5">
      <div>
        <h2 className="text-xl leading-tight">Start a team</h2>
        <p className="mt-1 text-sm text-dim">Name it, then send your teammates the invite link so they can join it.</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          start.mutate()
        }}
      >
        <div className="min-w-0 flex-[1_1_12rem] space-y-1.5">
          <Label htmlFor="squad-name">Team name</Label>
          <Input
            id="squad-name"
            className="h-11"
            value={name}
            maxLength={SQUAD_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type="submit" className="h-11" disabled={!name.trim() || start.isPending}>
          <Users /> {start.isPending ? 'Starting…' : 'Start a team'}
        </Button>
      </form>
      {start.error ? <Problem error={start.error} /> : null}
    </section>
  )
}

/** Join or leave one team's group in the entrant list, for an accepted player before the reveal. */
export function SquadAction({
  token,
  sealedEvent,
  squadId,
  viewerSquadId,
}: {
  token: string
  sealedEvent: SealedEvent
  squadId: string
  viewerSquadId: string | null
}) {
  const refresh = useSealedEventRefresh(token)
  const squad = sealedEvent.squads.find((candidate) => candidate.id === squadId)
  const change = useMutation({
    mutationFn: (join: boolean) => setSquad({ data: { token, eventToken: sealedEvent.eventToken, squad: join ? { squadId } : null } }),
    onSuccess: refresh,
  })
  if (!squad) return null
  const own = viewerSquadId === squadId
  if (!own && squad.memberIds.length >= sealedEvent.teams!.size) return null
  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={own ? 'ghost' : 'outline'}
        className="pointer-coarse:h-11"
        disabled={change.isPending}
        onClick={() => change.mutate(!own)}
      >
        {own ? <LogOut /> : <UserPlus />} {own ? 'Leave team' : viewerSquadId ? 'Switch to this team' : 'Join team'}
      </Button>
      {change.error ? <Problem error={change.error} className="text-xs" /> : null}
    </span>
  )
}

/**
 * One meeting of two teams in a round: its score, and until its games are paired, the pairing process. Each step both
 * teams choose in secret; a step shows once both have chosen.
 */
export function SquadMeeting({
  token,
  sealedEvent,
  match,
  viewerSquadId,
  score,
  name,
  label,
  children,
}: {
  token: string
  sealedEvent: SealedEvent
  match: SquadMatch
  viewerSquadId: string | null
  /** Each team's games won or victory points so far, as the team result counts them. */
  score: readonly [number, number] | null
  name: (userId: string) => ReactNode
  label: (userId: string) => string
  /** The meeting's tables, once its games are paired. */
  children: ReactNode
}) {
  const squadName = (squadId: string | null) => sealedEvent.squads.find((squad) => squad.id === squadId)?.name ?? 'A team'
  const size = sealedEvent.teams!.size
  const members = [match.aId, match.bId].map((squadId) => sealedEvent.squads.find((squad) => squad.id === squadId)?.memberIds ?? []) as [
    string[],
    string[],
  ]
  const state = squadPairing(members, match.revealed)
  const side = viewerSquadId === match.aId ? 0 : viewerSquadId === match.bId && match.bId ? 1 : null
  return (
    <li data-meeting={match.table} className="min-w-0">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-edge px-2 py-2 sm:px-3">
        <span className="part-tag">{match.table}</span>
        <span className="min-w-0 flex-[1_1_10rem] font-display text-base font-bold break-words">
          {squadName(match.aId)}
          {match.bId ? <span className="font-sans font-normal text-dim"> vs </span> : null}
          {match.bId ? squadName(match.bId) : null}
        </span>
        {!match.bId ? (
          <span className={`${OUTLINE_TAG} border-edge text-dim`}>Bye</span>
        ) : score ? (
          <ScoreFigure a={score[0]} b={score[1]} />
        ) : null}
      </div>
      {!match.bId ? null : state.step ? (
        <PairingProcess
          token={token}
          sealedEvent={sealedEvent}
          match={match}
          state={state}
          side={side}
          organizes={sealedEvent.organizer}
          squadName={squadName}
          name={name}
          label={label}
          steps={squadStepCount(size)}
        />
      ) : (
        <ol className="divide-y divide-edge">{children}</ol>
      )}
    </li>
  )
}

function PairingProcess({
  token,
  sealedEvent,
  match,
  state,
  side,
  organizes,
  squadName,
  name,
  label,
  steps,
}: {
  token: string
  sealedEvent: SealedEvent
  match: SquadMatch
  state: SquadPairingState
  side: 0 | 1 | null
  /** Whether the reader runs the event, and so may pick for a team that can't. */
  organizes: boolean
  squadName: (squadId: string | null) => string
  name: (userId: string) => ReactNode
  label: (userId: string) => string
  steps: number
}) {
  const step = state.step!
  const squads = [match.aId, match.bId!] as const
  const stage = currentSquadStage({ ...state, step })
  const [standingIn, setStandingIn] = useState<0 | 1 | null>(null)
  const chooser = (team: 0 | 1, standIn: boolean) => (
    <PickChooser
      key={`${match.round}-${match.table}-${step.index}-${team}`}
      token={token}
      sealedEvent={sealedEvent}
      match={match}
      state={{ ...state, step }}
      side={team}
      team={standIn ? { id: squads[team], name: squadName(squads[team]) } : null}
      chosen={standIn ? null : match.chosen}
      name={name}
      label={label}
      defender={step.kind === 'attackers' ? stage?.defenders?.[1 - team] : step.kind === 'accept' ? stage?.defenders?.[team] : undefined}
    />
  )
  const ask =
    step.kind === 'defender'
      ? 'a defender'
      : step.kind === 'attackers'
        ? 'two attackers to send against the other defender'
        : 'which attacker their defender plays'
  const waiting = squads.filter((squadId) => !match.ready.includes(squadId))
  const joined = (ids: readonly string[]) =>
    ids.map((id, index) => (
      <span key={id}>
        {index ? ' and ' : null}
        {name(id)}
      </span>
    ))
  return (
    <div data-pairing-process className="space-y-3 px-3 py-3">
      <p className="text-sm text-dim">
        <span className="font-semibold text-bone">{`Step ${step.index + 1} of ${steps}: `}</span>
        {`each team chooses ${ask}. `}
        {waiting.length === 2 ? 'Neither team has chosen yet.' : waiting.length ? `Waiting for ${squadName(waiting[0]!)}.` : null}
      </p>
      {state.stages.length ? (
        <ul className="space-y-1 text-sm">
          {state.stages.flatMap((past, index) =>
            [0, 1].map((team) => {
              const defender = past.defenders?.[team]
              if (!defender) return null
              const attackers = past.attackers?.[1 - team]
              const accepted = past.accepted?.[team]
              return (
                <li key={`${index}-${team}`} className="min-w-0 break-words">
                  <span className="text-dim">{`${squadName(squads[team]!)} defends with `}</span>
                  {name(defender)}
                  {attackers ? (
                    <>
                      <span className="text-dim">{' against '}</span>
                      {joined(attackers)}
                    </>
                  ) : null}
                  {accepted ? (
                    <>
                      <span className="text-dim">{', and plays '}</span>
                      {name(accepted)}
                    </>
                  ) : null}
                </li>
              )
            }),
          )}
        </ul>
      ) : null}
      {state.games.length ? (
        <p className="text-sm">
          <span className="text-dim">{`Paired so far: `}</span>
          {state.games.map(([a, b], index) => (
            <span key={a}>
              {index ? <span className="text-dim">; </span> : null}
              {name(a)}
              <span className="text-dim"> vs </span>
              {name(b)}
            </span>
          ))}
        </p>
      ) : null}
      {side !== null ? (
        chooser(side, false)
      ) : organizes && waiting.length ? (
        <>
          {/* A team whose players are gone would otherwise hold up the whole round. */}
          <div className="flex flex-wrap items-center gap-2">
            {waiting.map((squadId) => {
              const team = squads.indexOf(squadId) as 0 | 1
              return (
                <Button
                  key={squadId}
                  size="sm"
                  variant={standingIn === team ? 'default' : 'outline'}
                  aria-pressed={standingIn === team}
                  className="pointer-coarse:h-11"
                  onClick={() => setStandingIn(standingIn === team ? null : team)}
                >
                  {`Pick for ${squadName(squadId)}`}
                </Button>
              )
            })}
          </div>
          {standingIn !== null && waiting.includes(squads[standingIn]) ? chooser(standingIn, true) : null}
        </>
      ) : null}
    </div>
  )
}

/** A team's secret choice at the current step; it can change until the other team has chosen too. */
function PickChooser({
  token,
  sealedEvent,
  match,
  state,
  side,
  team,
  chosen,
  name,
  label,
  defender,
}: {
  token: string
  sealedEvent: SealedEvent
  match: SquadMatch
  state: SquadPairingState & { step: NonNullable<SquadPairingState['step']> }
  side: 0 | 1
  /** The team an organizer picks for, or null when the reader picks for their own. */
  team: { id: string; name: string } | null
  /** What the team has locked in at this step, until the other team chooses too. */
  chosen: readonly string[] | null
  name: (userId: string) => ReactNode
  /** A player's plain name, for a button whose colours would clash with their own. */
  label: (userId: string) => string
  /** The defender this step is about: the other team's for attackers, the team's own when choosing whom it plays. */
  defender: string | undefined
}) {
  const refresh = useSealedEventRefresh(token)
  const { step } = state
  const choices = squadStepChoices(state, side)
  // A teammate may lock in or change the team's pick meanwhile, so the saved pick shows until this reader changes it.
  const [edited, setEdited] = useState<string[] | null>(null)
  const picked = edited ?? chosen ?? []
  const pick = useMutation({
    mutationFn: () =>
      pickSquad({
        data: {
          token,
          eventToken: sealedEvent.eventToken,
          round: match.round,
          table: match.table,
          step: step.index,
          userIds: [...picked],
          squadId: team?.id,
        },
      }),
    onSuccess: async () => {
      setEdited(null)
      await refresh()
    },
  })
  const toggle = (userId: string) =>
    setEdited(
      picked.includes(userId)
        ? picked.filter((id) => id !== userId)
        : choices.count === 1
          ? [userId]
          : [...picked, userId].slice(-choices.count),
    )
  const whose = team ? `${team.name}’s` : 'your'
  const prompt =
    step.kind === 'defender'
      ? `Choose ${whose} defender`
      : step.kind === 'attackers'
        ? `Choose ${whose} two attackers`
        : `Choose whom ${whose} defender plays`
  const saved = !!chosen && chosen.length === picked.length && chosen.every((id) => picked.includes(id))
  return (
    <fieldset className="space-y-2 rounded-lg border border-parchment/40 bg-parchment/5 p-3" disabled={pick.isPending}>
      <legend className="px-1 text-xs font-semibold text-parchment">{prompt}</legend>
      {defender ? (
        <p className="text-xs text-dim">
          {step.kind === 'attackers' ? 'The other defender is ' : `${team ? `${team.name}’s` : 'Your'} defender is `}
          {name(defender)}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {choices.from.map((userId) => {
          const on = picked.includes(userId)
          return (
            <Button
              key={userId}
              size="sm"
              variant={on ? 'default' : 'outline'}
              aria-pressed={on}
              className="pointer-coarse:h-11"
              onClick={() => toggle(userId)}
            >
              {on ? <Check /> : null}
              {label(userId)}
            </Button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button size="sm" disabled={picked.length !== choices.count || saved} onClick={() => pick.mutate()}>
          {pick.isPending ? 'Saving…' : chosen ? 'Change choice' : 'Lock in'}
        </Button>
        <p className="min-w-0 flex-1 text-xs text-dim">
          {chosen
            ? 'Locked in. You can change it until the other team chooses; then both show at once.'
            : `Pick ${countLabel(choices.count, 'player')}. Nobody sees it until the other team has chosen too.`}
        </p>
      </div>
      {pick.error ? <Problem error={pick.error} /> : null}
    </fieldset>
  )
}
