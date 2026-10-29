import { Link } from '@tanstack/react-router'
import type { Standing, StandingFaction } from '../../../core/standings'
import { winRate } from '../../../core/standings'
import { FactionMark } from '../../components/FactionMark'
import { percentLabel, countLabel } from '../../text'

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
 * Absent entirely when the player is in none of the tables: the leaderboard lists
 * only players with a recent public battle, so a player who has not played lately
 * or whose games are withheld from it has no place rather than last place.
 */
export function PlayerRankings({ rankings }: { rankings: Rankings }) {
  const rows = [...(rankings.overall ? [rankings.overall] : []), ...rankings.factions]
  if (!rows.length) return null
  return (
    <section data-rankings>
      <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Leaderboard</span>
        <span className="text-xs text-faint normal-case">Last {rankings.days} days</span>
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ faction, place, of, standing }) => (
          <Link
            key={faction?.slug ?? 'overall'}
            to="/leaderboard"
            search={{ faction: faction?.slug }}
            className="flex min-w-0 items-center gap-3 border border-edge bg-panel p-3 transition-colors hover:border-info hover:bg-raised"
          >
            <span className="figure w-14 shrink-0 text-2xl leading-none font-bold text-bone">
              #{place}
              <span className="block text-2xs font-normal text-faint">of {of}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                {faction ? <FactionMark faction={faction} size="sm" /> : null}
                <span className="truncate text-sm font-bold uppercase">{faction?.displayName ?? 'Everyone'}</span>
              </span>
              <span className="readout mt-0.5 block truncate text-xs text-dim">
                {standing.rating} rating · {percentLabel(winRate(standing))} · {countLabel(standing.battles, 'battle')}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
