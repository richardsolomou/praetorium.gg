import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock, RotateCcw, Shuffle, Swords } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { LeagueEntryView } from '../../../core/league'
import { rematches } from '../../../core/swiss'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Problem } from '../../components/Problem'
import { pairLeagueRound, reopenSwissTable } from '../../functions'
import type { Battle } from '../battles/battle'
import { SectionHeading } from '../../components/SectionHeading'
import { useLeagueRefresh, type League } from './leagueEvent'

type Pairing = League['pairings'][number]
/** What the rounds read of a table's battle, which the sample tournament supplies without a real one. */
type TableBattle = Pick<Battle, 'token' | 'status' | 'scores' | 'playerIds'>

/** Whether a table is settled without a battle: one of its players dropped before it finished. */
export function forfeited(pairing: Pick<Pairing, 'aId' | 'bId'>, entries: readonly { userId: string; dropped: boolean }[]) {
  return entries.some((entry) => entry.dropped && (entry.userId === pairing.aId || entry.userId === pairing.bId))
}

/** The rounds still to pair and whether the latest has every table finished, from the battles the page has loaded. */
export function swissProgress(league: Pick<League, 'pairings' | 'rounds' | 'entries'>, battles: readonly TableBattle[]) {
  const round = Math.max(0, ...league.pairings.map((pairing) => pairing.round))
  const current = league.pairings.filter((pairing) => pairing.round === round)
  const finished = new Set(battles.filter((battle) => battle.status === 'finished').map((battle) => battle.token))
  const open = current.filter(
    (pairing) => pairing.bId !== null && !(pairing.battleToken && finished.has(pairing.battleToken)) && !forfeited(pairing, league.entries),
  )
  return { round, rounds: league.rounds ?? 0, current, open, complete: open.length === 0 }
}

/** The viewer's table in the latest round, if they have one. */
export function ownTable(league: Pick<League, 'pairings'>, viewerId: string | null) {
  const round = Math.max(0, ...league.pairings.map((pairing) => pairing.round))
  return league.pairings.find((pairing) => pairing.round === round && (pairing.aId === viewerId || pairing.bId === viewerId))
}

/**
 * Swiss rounds, latest first: who sits at which table, how each battle stands, and the organizer's button to pair the
 * next round once every table has finished.
 */
export function LeagueRounds({
  league,
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
  league: League
  token: string
  battles: readonly TableBattle[]
  viewerId: string | null
  isOrganizer: boolean
  entries: readonly LeagueEntryView[]
  label: (entry: LeagueEntryView) => string
  onPlay: (opponentId: string) => void
  playing: boolean
  /** The sample tournament's made-up battles, which have no page to open. */
  sample?: boolean
}) {
  const refresh = useLeagueRefresh(token)
  const pair = useMutation({
    mutationFn: () => pairLeagueRound({ data: { token, eventToken: league.eventToken } }),
    onSettled: refresh,
  })
  const progress = swissProgress(league, battles)
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
  const rematch = rematches(league.pairings)
  const rounds = [...new Set(league.pairings.map((pairing) => pairing.round))].toSorted((a, b) => b - a)
  const next = progress.round + 1
  const canPair = isOrganizer && next <= progress.rounds && progress.complete
  return (
    <section data-league-rounds>
      <SectionHeading
        title={progress.round ? `Round ${progress.round} of ${progress.rounds}` : `${progress.rounds} Swiss rounds`}
        action={
          canPair ? (
            <Button size="sm" disabled={pair.isPending} onClick={() => pair.mutate()}>
              <Shuffle /> {pair.isPending ? 'Pairing…' : `Pair round ${next}`}
            </Button>
          ) : null
        }
      />
      {pair.error ? <Problem error={pair.error} className="mb-2" /> : null}
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
          {rounds.map((round) => (
            <div key={round}>
              {rounds.length > 1 ? (
                <p className="eyebrow mb-1.5 flex items-center gap-1.5">
                  <span>Round {round}</span>
                  {round < progress.round ? (
                    <span className="flex items-center gap-1 text-faint">
                      <Lock className="size-3" aria-hidden /> <span>Results locked</span>
                    </span>
                  ) : null}
                </p>
              ) : null}
              <ol className="divide-y divide-edge border border-edge bg-panel">
                {league.pairings
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
                      reopen={isOrganizer && !sample && pairing.battleToken ? { token, eventToken: league.eventToken } : undefined}
                    />
                  ))}
              </ol>
            </div>
          ))}
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
}) {
  const own = pairing.aId === viewerId || pairing.bId === viewerId
  const opponent = pairing.aId === viewerId ? pairing.bId : pairing.aId
  return (
    <li data-table={pairing.table} className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 p-3 ${own ? 'bg-raised' : ''}`}>
      <span className="figure w-6 shrink-0 text-sm text-faint">{pairing.table}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">
        {name(pairing.aId)}
        {pairing.bId ? <span className="font-normal text-dim"> vs </span> : null}
        {pairing.bId ? name(pairing.bId) : null}
      </span>
      {rematch ? <span className="chip shrink-0 text-dim">Rematch</span> : null}
      {!pairing.bId ? (
        <span className="chip shrink-0 text-dim">Bye</span>
      ) : forfeit ? (
        <span className="chip shrink-0 text-dim">Bye</span>
      ) : pairing.battleToken && sample ? (
        <span className="shrink-0 text-sm text-info">{battleState(battle, pairing.aId, pairing.bId)}</span>
      ) : pairing.battleToken ? (
        <Link to="/battles/$token" params={{ token: pairing.battleToken }} className="shrink-0 text-sm text-info hover:text-bone">
          {battleState(battle, pairing.aId, pairing.bId)}
        </Link>
      ) : own && current && opponent ? (
        <Button size="sm" disabled={playing} onClick={() => onPlay(opponent)}>
          <Swords /> Start battle
        </Button>
      ) : (
        <span className="shrink-0 text-sm text-faint">Not started</span>
      )}
      {reopen && pairing.battleToken && battle?.status === 'finished' ? (
        <ReopenTable {...reopen} battleToken={pairing.battleToken} table={pairing.table} />
      ) : null}
    </li>
  )
}

/** An organizer's way to reopen a table's finished battle, whether or not they played it, so its players can correct the result. */
function ReopenTable({ token, eventToken, battleToken, table }: { token: string; eventToken: string; battleToken: string; table: number }) {
  const refresh = useLeagueRefresh(token)
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
      <Tooltip>
        <TooltipTrigger
          render={
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
        </TooltipTrigger>
        <TooltipContent role="tooltip" side="bottom">
          Reopen result
        </TooltipContent>
      </Tooltip>
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
