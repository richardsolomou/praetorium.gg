import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { ServiceRecord } from '../../../core/serviceRecord'

/** The player's record as their profile counts it, and their overall leaderboard place if they have one. */
export type HomeRecordData = {
  record: Pick<ServiceRecord, 'battles' | 'won' | 'lost' | 'drawn' | 'rate' | 'currentStreak'>
  rank: { place: number; of: number } | null
}

const TILES = 'mt-5 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(4,8.5rem)]'

/**
 * The player's standing at a glance, under the greeting.
 *
 * Each tile opens where its figure is broken down. The tiles
 * keep their size while the record is folded, so the band does not jump when it arrives.
 */
export function HomeRecord({ userId, data }: { userId: string; data: HomeRecordData | null | undefined }) {
  if (data === null) return null
  if (!data) {
    return (
      <div className={TILES} aria-label="Loading your record">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-16" />
        ))}
      </div>
    )
  }
  const { record, rank } = data
  if (!record.battles) {
    return <p className="mt-5 text-sm text-dim">Your record starts with your first finished battle.</p>
  }
  const rate = Math.round(record.rate * 100)
  const profile = { to: '/users/$userId', params: { userId }, className: TILE } as const
  return (
    <div className={TILES} data-home-record>
      <Link {...profile}>
        <Stat label="W · D · L">
          <span className="text-achieved">{record.won}</span>
          <span className="text-faint">–</span>
          <span className="text-dim">{record.drawn}</span>
          <span className="text-faint">–</span>
          <span className="text-rust">{record.lost}</span>
        </Stat>
      </Link>
      <Link {...profile}>
        <Stat label="Win rate" bar={rate}>
          {rate}%
        </Stat>
      </Link>
      <Link {...profile}>
        <Stat label="Streak">{record.currentStreak ? `${record.currentStreak} ${record.currentStreak === 1 ? 'win' : 'wins'}` : '—'}</Stat>
      </Link>
      <Link to="/leaderboard" search={{ faction: undefined }} className={TILE}>
        <Stat label="Leaderboard">
          {rank ? (
            <>
              #{rank.place}
              <span className="text-sm font-normal text-faint"> of {rank.of}</span>
            </>
          ) : (
            <span className="text-dim">Unranked</span>
          )}
        </Stat>
      </Link>
    </div>
  )
}

/** The leaderboard opens on its own tile; the other figures open the profile that breaks them down. */
const TILE =
  'relative flex h-16 min-w-0 flex-col justify-center overflow-hidden border border-edge bg-sunken/60 px-3 transition-colors hover:border-info hover:bg-raised'

function Stat({ label, bar, children }: { label: string; bar?: number; children: ReactNode }) {
  return (
    <>
      <span className="eyebrow text-faint">{label}</span>
      <span className="figure mt-1 text-xl leading-none font-bold whitespace-nowrap text-bone">{children}</span>
      {bar === undefined ? null : (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-edge" aria-hidden>
          <span className="block h-full bg-achieved" style={{ width: `${bar}%` }} />
        </span>
      )}
    </>
  )
}
