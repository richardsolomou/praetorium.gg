import { Link } from '@tanstack/react-router'
import type { Standing, StandingFaction } from '../../../core/standings'
import { winRate } from '../../../core/standings'
import { FactionMark } from '../FactionMark'

type Ranking<T> = { faction: T; place: number; of: number; standing: Standing }

export type Rankings = {
  days: number
  overall: Ranking<null> | null
  factions: Ranking<StandingFaction>[]
}

/**
 * Where this player sits on the leaderboard, overall and with each army.
 *
 * The same rows that page prints, read from the same held fold, so a rank here is
 * the rank there. Each one opens the table it came from, because a place is only
 * meaningful next to the players it was measured against.
 *
 * Absent entirely when the player is in none of the tables: the leaderboard counts
 * a bounded window of public battles, so a player whose games are older than it or
 * withheld from it has no place rather than last place.
 */
export function PlayerRankings({ rankings }: { rankings: Rankings }) {
  const rows = [...(rankings.overall ? [rankings.overall] : []), ...rankings.factions]
  if (!rows.length) return null
  return (
    <section data-rankings>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Leaderboard</span>
        <span className="text-xs text-faint normal-case">Last {rankings.days} days</span>
      </p>
      <div className="mt-2 space-y-2">
        {rows.map(({ faction, place, of, standing }) => (
          <Link
            key={faction?.slug ?? 'overall'}
            to="/leaderboard"
            search={{ faction: faction?.slug }}
            className="flex items-center justify-between gap-3 border border-edge bg-panel p-3 hover:border-edge-strong"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="chip readout shrink-0">
                {place}/{of}
              </span>
              {faction ? <FactionMark id={faction.slug} icon={faction.icon} size="sm" /> : null}
              <span className="truncate font-bold uppercase">{faction?.displayName ?? 'Everyone'}</span>
            </span>
            <span className="readout shrink-0 text-xs text-dim">
              {standing.won} won · {Math.round(winRate(standing) * 100)}% · {standing.battles}{' '}
              {standing.battles === 1 ? 'battle' : 'battles'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
