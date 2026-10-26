import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock, Shuffle, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LeagueEntryView } from '../../../core/league'
import { rematches } from '../../../core/swiss'
import { Problem } from '../../components/Problem'
import { pairLeagueRound } from '../../functions'
import type { Battle } from '../battles/battle'
import { SectionHeading } from '../../components/SectionHeading'
import { useLeagueRefresh, type League } from './leagueEvent'

type Pairing = League['pairings'][number]

/** The rounds still to pair and whether the latest has every table finished, from the battles the page has loaded. */
export function swissProgress(league: Pick<League, 'pairings' | 'rounds'>, battles: readonly Battle[]) {
  const round = Math.max(0, ...league.pairings.map((pairing) => pairing.round))
  const current = league.pairings.filter((pairing) => pairing.round === round)
  const finished = new Set(battles.filter((battle) => battle.status === 'finished').map((battle) => battle.token))
  const open = current.filter((pairing) => pairing.bId !== null && !(pairing.battleToken && finished.has(pairing.battleToken)))
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
}: {
  league: League
  token: string
  battles: readonly Battle[]
  viewerId: string | null
  isOrganizer: boolean
  entries: readonly LeagueEntryView[]
  label: (entry: LeagueEntryView) => string
  onPlay: (opponentId: string) => void
  playing: boolean
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
    return entry ? label(entry) : 'A player'
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
                      viewerId={viewerId}
                      current={round === progress.round}
                      onPlay={onPlay}
                      playing={playing}
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
  viewerId,
  current,
  onPlay,
  playing,
}: {
  pairing: Pairing
  rematch: boolean
  battle: Battle | undefined
  name: (userId: string) => string
  viewerId: string | null
  current: boolean
  onPlay: (opponentId: string) => void
  playing: boolean
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
      ) : pairing.battleToken ? (
        <Link to="/battles/$token" params={{ token: pairing.battleToken }} className="shrink-0 text-sm text-info hover:text-bone">
          {battle?.status === 'finished'
            ? `${score(battle, pairing.aId)} – ${score(battle, pairing.bId)}`
            : battle?.status === 'playing'
              ? 'Playing'
              : 'Setting up'}
        </Link>
      ) : own && current && opponent ? (
        <Button size="sm" disabled={playing} onClick={() => onPlay(opponent)}>
          <Swords /> Start battle
        </Button>
      ) : (
        <span className="shrink-0 text-sm text-faint">Not started</span>
      )}
    </li>
  )
}

/** The victory points a player's side finished on, read in the table's order rather than the battle's seats. */
const score = (battle: Battle, userId: string) => battle.scores[battle.playerIds.indexOf(userId)] ?? 0
