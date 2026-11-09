import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Dices, Lock, RotateCcw, Shuffle, Swords } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconAction } from './SealedEventEntrants'
import type { SealedEventEntryView } from '../../../core/sealedEvent'
import { rematches } from '../../../core/swiss'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { pairSealedEventRound, reopenSwissTable, setTableBattlefield } from '../../functions'
import { useStartBattle } from '../battles/useStartBattle'
import type { Battle } from '../battles/battle'
import { SectionHeading } from '../../components/SectionHeading'
import { useSealedEventRefresh, type SealedEvent } from './sealedEvent'
import { TableBattlefield } from './TableBattlefield'
import { ReportTableResult } from './ReportTableResult'
import { RoundClock, SwapSeats } from './RoundTools'
import { CheckIn } from './CheckIn'

type Pairing = SealedEvent['pairings'][number]
/** What the rounds read of a table's battle, which the sample tournament supplies without a real one. */
type TableBattle = Pick<Battle, 'token' | 'status' | 'scores' | 'playerIds'>

/** Whether a table is settled without a battle: one of its players dropped before it finished. */
export function forfeited(pairing: Pick<Pairing, 'aId' | 'bId'>, entries: readonly { userId: string; dropped: boolean }[]) {
  return entries.some((entry) => entry.dropped && (entry.userId === pairing.aId || entry.userId === pairing.bId))
}

/** The rounds still to pair and whether the latest has every table finished, from the battles the page has loaded. */
export function swissProgress(sealedEvent: Pick<SealedEvent, 'pairings' | 'rounds' | 'entries'>, battles: readonly TableBattle[]) {
  const round = Math.max(0, ...sealedEvent.pairings.map((pairing) => pairing.round))
  const current = sealedEvent.pairings.filter((pairing) => pairing.round === round)
  const finished = new Set(battles.filter((battle) => battle.status === 'finished').map((battle) => battle.token))
  const open = current.filter(
    (pairing) =>
      pairing.bId !== null && !(pairing.battleToken && finished.has(pairing.battleToken)) && !forfeited(pairing, sealedEvent.entries),
  )
  return { round, rounds: sealedEvent.rounds ?? 0, current, open, complete: open.length === 0 }
}

/** The viewer's table in the latest round, if they have one. */
export function ownTable(sealedEvent: Pick<SealedEvent, 'pairings'>, viewerId: string | null) {
  const round = Math.max(0, ...sealedEvent.pairings.map((pairing) => pairing.round))
  return sealedEvent.pairings.find((pairing) => pairing.round === round && (pairing.aId === viewerId || pairing.bId === viewerId))
}

/**
 * Swiss rounds, latest first: who sits at which table, how each battle stands, and the organizer's button to pair the
 * next round once every table has finished.
 */
export function SealedEventRounds({
  sealedEvent,
  token,
  battles,
  viewerId,
  isOrganizer,
  entries,
  label,
  onPlay,
  playing,
  sample = false,
}: {
  sealedEvent: SealedEvent
  token: string
  battles: readonly TableBattle[]
  viewerId: string | null
  isOrganizer: boolean
  entries: readonly SealedEventEntryView[]
  label: (entry: SealedEventEntryView) => string
  onPlay: (opponentId: string) => void
  playing: boolean
  /** The sample tournament's made-up battles, which have no page to open. */
  sample?: boolean
}) {
  const refresh = useSealedEventRefresh(token)
  const pair = useMutation({
    mutationFn: () => pairSealedEventRound({ data: { token, eventToken: sealedEvent.eventToken } }),
    onSettled: refresh,
  })
  const { defaultMissionPackId } = useStartBattle()
  const progress = swissProgress(sealedEvent, battles)
  const unset = progress.current.filter(
    (pairing) =>
      pairing.bId !== null &&
      !pairing.battleToken &&
      !sealedEvent.battlefields.some(({ round, table }) => round === pairing.round && table === pairing.table),
  )
  // A table whose armies name no layouts stays for its players to choose, so one refusal doesn't stop the rest.
  const rollAll = useMutation({
    mutationFn: async () => {
      const missionPackId = await defaultMissionPackId()
      await Promise.allSettled(
        unset.map(({ round, table }) =>
          setTableBattlefield({ data: { token, eventToken: sealedEvent.eventToken, round, table, missionPackId, battlefield: 'roll' } }),
        ),
      )
    },
    onSettled: refresh,
  })
  const byToken = new Map(battles.map((battle) => [battle.token, battle]))
  const name = (userId: string) => {
    const entry = entries.find((candidate) => candidate.userId === userId)
    return (
      <>
        {entry ? label(entry) : 'A player'}
        {entry?.dropped ? <span className="chip ml-1.5 align-middle text-dim">Dropped</span> : null}
      </>
    )
  }
  const rematch = rematches(sealedEvent.pairings)
  const seatLabel = (userId: string) => {
    const entry = entries.find((candidate) => candidate.userId === userId)
    return { value: userId, label: entry ? label(entry) : 'A player' }
  }
  const swappable = progress.current
    .filter((pairing) => !pairing.battleToken)
    .flatMap((pairing) => (pairing.bId ? [pairing.aId, pairing.bId] : [pairing.aId]))
    .map(seatLabel)
  const rounds = [...new Set(sealedEvent.pairings.map((pairing) => pairing.round))].toSorted((a, b) => b - a)
  const next = progress.round + 1
  const canPair = isOrganizer && next <= progress.rounds && progress.complete
  return (
    <section data-sealed-event-rounds>
      <SectionHeading
        title={progress.round ? `Round ${progress.round} of ${progress.rounds}` : `${progress.rounds} Swiss rounds`}
        action={
          canPair ? (
            <Button size="sm" disabled={pair.isPending} onClick={() => pair.mutate()}>
              <Shuffle /> {pair.isPending ? 'Pairing…' : `Pair round ${next}`}
            </Button>
          ) : isOrganizer && !sample && unset.length ? (
            <Button size="sm" variant="outline" disabled={rollAll.isPending} onClick={() => rollAll.mutate()}>
              <Dices /> {rollAll.isPending ? 'Rolling…' : 'Roll battlefields'}
            </Button>
          ) : null
        }
      />
      {pair.error ? <Problem error={pair.error} className="mb-2" /> : null}
      {!progress.round && !sample ? (
        <CheckIn
          token={token}
          eventToken={sealedEvent.eventToken}
          entries={entries}
          viewerId={viewerId}
          organizes={isOrganizer}
          label={label}
        />
      ) : null}
      {progress.round && !progress.complete && !sample ? (
        <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
          <RoundClock token={token} eventToken={sealedEvent.eventToken} endsAt={sealedEvent.roundEndsAt} organizes={isOrganizer} />
          {isOrganizer && swappable.length >= 2 ? (
            <SwapSeats token={token} eventToken={sealedEvent.eventToken} players={swappable} />
          ) : null}
        </div>
      ) : null}
      {progress.rounds ? (
        <ol aria-hidden className="mb-4 flex gap-1.5">
          {Array.from({ length: progress.rounds }, (_, index) => {
            const round = index + 1
            const line =
              round < progress.round || (round === progress.round && progress.complete) ? 'done' : round === progress.round ? 'now' : 'todo'
            return (
              <li key={round} className="min-w-0 flex-1">
                <span data-line={line} className="line-segment" />
                <span
                  className={`mt-1 block text-2xs font-semibold tracking-label uppercase ${line === 'now' ? 'text-parchment' : line === 'done' ? 'text-dim' : 'text-faint'}`}
                >
                  R{round}
                </span>
              </li>
            )
          })}
        </ol>
      ) : null}
      {!rounds.length ? (
        <p className="text-sm text-dim">
          {isOrganizer
            ? 'Pair round 1 when everyone is ready. The first round is drawn at random; after that, players meet others on the same score.'
            : 'The organizer pairs each round. The first is drawn at random; after that, players meet others on the same score.'}
        </p>
      ) : (
        <div className="space-y-4">
          {!progress.complete ? (
            <p className="text-sm text-dim">
              {progress.open.length === 1 ? 'One table is still playing.' : `${progress.open.length} tables are still playing.`}{' '}
              {isOrganizer && next <= progress.rounds ? `Round ${next} pairs once every table has finished.` : null}
            </p>
          ) : next > progress.rounds ? (
            <p className="text-sm text-dim">Every round is played. The results below are final.</p>
          ) : null}
          {rounds.length > 1 ? (
            <p className="text-sm text-dim">Results from earlier rounds are locked once the next round is paired.</p>
          ) : null}
          <div className="runner gap-3 [--gate-y:1.375rem]">
            {rounds.map((round) => (
              <div key={round} data-gate={round === progress.round && !progress.complete ? 'current' : undefined} className="part">
                {rounds.length > 1 ? (
                  <p className="flex min-h-11 items-center gap-2 rounded-t-xl border-b border-edge bg-sunken/40 px-3 text-xs font-semibold tracking-label uppercase">
                    <span className="part-tag part-tag-ghost">R{round}</span>
                    <span>Round {round}</span>
                    {round < progress.round ? (
                      <span className="ml-auto flex items-center gap-1 text-faint">
                        <Lock className="size-3" aria-hidden /> <span>Results locked</span>
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <ol className="divide-y divide-edge">
                  {sealedEvent.pairings
                    .filter((pairing) => pairing.round === round)
                    .map((pairing) => (
                      <TableRow
                        key={pairing.key}
                        pairing={pairing}
                        rematch={rematch.has(pairing)}
                        battle={pairing.battleToken ? byToken.get(pairing.battleToken) : undefined}
                        name={name}
                        forfeit={!pairing.battleToken && forfeited(pairing, entries)}
                        viewerId={viewerId}
                        current={round === progress.round}
                        onPlay={onPlay}
                        playing={playing}
                        sample={sample}
                        reopen={isOrganizer && !sample ? { token, eventToken: sealedEvent.eventToken } : undefined}
                        battlefield={sample ? undefined : { sealedEvent, token, organizes: isOrganizer }}
                      />
                    ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function TableRow({
  pairing,
  rematch,
  battle,
  name,
  forfeit,
  viewerId,
  current,
  onPlay,
  playing,
  sample,
  reopen,
  battlefield,
}: {
  pairing: Pairing
  rematch: boolean
  battle: TableBattle | undefined
  name: (userId: string) => ReactNode
  /** A player dropped before the table had a result, so it stands as a bye for the other. */
  forfeit: boolean
  viewerId: string | null
  current: boolean
  onPlay: (opponentId: string) => void
  playing: boolean
  sample: boolean
  /** The event an organizer reopens a finished result in, so its players can correct it. */
  reopen?: { token: string; eventToken: string }
  /** Absent in the sample tournament, which has no battlefields to read. */
  battlefield?: { sealedEvent: SealedEvent; token: string; organizes: boolean }
}) {
  const own = pairing.aId === viewerId || pairing.bId === viewerId
  const opponent = pairing.aId === viewerId ? pairing.bId : pairing.aId
  return (
    <li
      data-table={pairing.table}
      className={`flex min-h-12 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 last:rounded-b-xl ${own ? 'bg-parchment/5' : ''}`}
    >
      <span className="part-tag part-tag-ghost">{pairing.table}</span>
      <span className="min-w-0 flex-1 font-semibold break-words">
        {name(pairing.aId)}
        {pairing.bId ? <span className="font-normal text-dim"> vs </span> : null}
        {pairing.bId ? name(pairing.bId) : null}
      </span>
      {rematch ? <span className="chip shrink-0 text-dim">Rematch</span> : null}
      {!pairing.bId || forfeit ? (
        <span className="chip shrink-0 text-dim">Bye</span>
      ) : pairing.battleToken && sample ? (
        <span className="readout shrink-0 text-sm font-semibold text-bone">{battleState(battle, pairing.aId, pairing.bId)}</span>
      ) : pairing.battleToken ? (
        <Link
          to="/battles/$token"
          params={{ token: pairing.battleToken }}
          className="readout shrink-0 text-sm font-semibold text-bone hover:text-parchment"
        >
          {battleState(battle, pairing.aId, pairing.bId)}
        </Link>
      ) : own && current && opponent ? (
        <Button size="sm" disabled={playing} onClick={() => onPlay(opponent)}>
          <Swords /> Start battle
        </Button>
      ) : (
        <span className="shrink-0 text-sm text-faint">Not started</span>
      )}
      {battlefield && pairing.bId && !forfeit && current && (own || battlefield.organizes) && battle?.status !== 'finished' ? (
        <ReportTableResult
          token={battlefield.token}
          eventToken={battlefield.sealedEvent.eventToken}
          round={pairing.round}
          table={pairing.table}
          names={[name(pairing.aId), name(pairing.bId)]}
        />
      ) : null}
      {battlefield && pairing.bId && !forfeit ? (
        <TableBattlefield
          {...battlefield}
          round={pairing.round}
          table={pairing.table}
          canChange={battlefield.organizes && (!pairing.battleToken || battle?.status === 'setup')}
          label={`Table ${pairing.table} battlefield`}
        />
      ) : null}
      {reopen && pairing.battleToken && battle?.status === 'finished' ? (
        <ReopenTable {...reopen} battleToken={pairing.battleToken} table={pairing.table} />
      ) : null}
    </li>
  )
}

/** An organizer's way to reopen a table's finished battle, whether or not they played it, so its players can correct the result. */
function ReopenTable({ token, eventToken, battleToken, table }: { token: string; eventToken: string; battleToken: string; table: number }) {
  const refresh = useSealedEventRefresh(token)
  const [confirming, setConfirming] = useState(false)
  const reopen = useMutation({
    mutationFn: () => reopenSwissTable({ data: { token, eventToken, battleToken } }),
    onSuccess: async () => {
      setConfirming(false)
      await refresh()
    },
  })
  return (
    <>
      <IconAction
        tooltip="Reopen result"
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-dim pointer-coarse:size-11"
            aria-label={`Reopen table ${table}`}
            disabled={reopen.isPending}
            onClick={() => {
              reopen.reset()
              setConfirming(true)
            }}
          />
        }
      >
        <RotateCcw aria-hidden />
      </IconAction>
      <ConfirmDialog
        open={confirming}
        title={`Reopen table ${table}?`}
        description="The battle continues from its last turn, so its players can correct the score and finish it again. Until they do, the table has no result in the standings. No round is paired again."
        cancel="Keep result"
        confirm="Reopen result"
        pendingLabel="Reopening…"
        pending={reopen.isPending}
        error={reopen.error}
        onClose={() => {
          reopen.reset()
          setConfirming(false)
        }}
        onConfirm={() => reopen.mutate()}
      />
    </>
  )
}

const battleState = (battle: TableBattle | undefined, aId: string, bId: string) =>
  battle?.status === 'finished' ? `${score(battle, aId)} – ${score(battle, bId)}` : battle?.status === 'playing' ? 'Playing' : 'Setting up'

/** The victory points a player's side finished on, read in the table's order rather than the battle's seats. */
const score = (battle: TableBattle, userId: string) => battle.scores[battle.playerIds.indexOf(userId)] ?? 0
