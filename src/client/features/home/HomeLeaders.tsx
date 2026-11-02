import { Link } from '@tanstack/react-router'
import { ShelfLink } from '../../components/ShelfLink'
import { isProvisional, type Standing } from '../../../core/standings'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SectionHeading } from '../../components/SectionHeading'

/** How much of the leaderboard a visitor needs to see that people here are winning and losing. */
const TOP = 5

/**
 * The head of the leaderboard, for somebody deciding whether anybody plays here.
 *
 * The same `standings` rows the leaderboard ranks, cut short rather than re-ranked,
 * with the rating the order comes from and the wins behind it. Absent until somebody
 * is ranked, because an empty table is the opposite of the point.
 */
export function HomeLeaders({ rows: all }: { rows: readonly Standing[] }) {
  const rows = all.filter((row) => !isProvisional(row))
  if (!rows.length) return null
  return (
    <section data-home-leaders>
      <SectionHeading title="Leaderboard" />
      <ol className="part divide-y divide-edge overflow-hidden">
        {rows.slice(0, TOP).map((row, place) => (
          <li key={row.id}>
            <Link
              to="/users/$userId"
              params={{ userId: row.id }}
              className="flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-raised"
            >
              <span className="part-tag">{place + 1}</span>
              <PlayerAvatar name={row.name} image={row.image} className="size-7 text-3xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{row.name}</span>
                <span className="block text-xs text-dim">
                  <span className="readout">{row.won}</span> {row.won === 1 ? 'win' : 'wins'}
                </span>
              </span>
              <span className="figure w-14 shrink-0 text-right text-base font-bold text-bone">{row.rating}</span>
            </Link>
          </li>
        ))}
      </ol>
      <ShelfLink to="/leaderboard" search={{ faction: undefined }} className="mt-3">
        Full leaderboard
      </ShelfLink>
    </section>
  )
}
