import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { type Standing, winRate } from '../../../core/standings'
import { PlayerAvatar } from '../../components/PlayerAvatar'

/** How much of the leaderboard a visitor needs to see that people here are winning and losing. */
const TOP = 5

/**
 * The head of the leaderboard, for somebody deciding whether anybody plays here.
 *
 * The same `standings` rows the leaderboard ranks, cut short rather than re-ranked,
 * with the two numbers the order comes from. Absent until a public battle has
 * finished, because an empty table is the opposite of the point.
 */
export function HomeLeaders({ rows, days }: { rows: readonly Standing[]; days: number }) {
  if (!rows.length) return null
  return (
    <section data-home-leaders>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Leaderboard</span>
        <span className="text-xs font-normal tracking-normal text-faint normal-case">Last {days} days</span>
      </p>
      <ol className="divide-y divide-edge border-b border-edge">
        {rows.slice(0, TOP).map((row, place) => (
          <li key={row.id}>
            <Link
              to="/users/$userId"
              params={{ userId: row.id }}
              className="flex min-w-0 items-center gap-3 -mx-3 px-3 py-3 hover:bg-raised"
            >
              <span className="readout w-5 shrink-0 text-faint">{place + 1}</span>
              <PlayerAvatar name={row.name} image={row.image} className="size-7 text-3xs" />
              <span className="min-w-0 flex-1 truncate font-bold uppercase">{row.name}</span>
              <span className="shrink-0 text-sm text-dim">
                <span className="readout text-bone">{row.won}</span> {row.won === 1 ? 'win' : 'wins'}
              </span>
              <span className="readout w-12 shrink-0 text-right text-sm text-dim">{Math.round(winRate(row) * 100)}%</span>
            </Link>
          </li>
        ))}
      </ol>
      <Link
        to="/leaderboard"
        search={{ faction: undefined }}
        className="eyebrow mt-2 inline-flex items-center gap-1 text-info hover:text-parchment"
      >
        Full leaderboard <ChevronRight className="size-3.5" />
      </Link>
    </section>
  )
}
