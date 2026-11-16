import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ServiceRecord } from '../../../core/serviceRecord'
import type { BattleOutcome } from '../../../core/standings'
import { battleOutcomeStage } from '../../battleStage'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { countLabel } from '../../text'
import { ResultLetter } from '../battles/BattleLines'

/** The player's record as their profile counts it, and their overall leaderboard place if they have one. */
export type HomeRecordData = {
  record: Pick<ServiceRecord, 'battles' | 'won' | 'lost' | 'drawn' | 'rate' | 'currentStreak'>
  rank: { place: number; of: number } | null
}

/** What the player's latest finished games say beside the record: how they went, newest first, the armies in them, and how far they moved the player's rating. */
export type HomeForm = {
  outcomes: readonly BattleOutcome[]
  armies: readonly { faction: FactionPresentation; battles: number }[]
  /** Null until a game has moved the rating, which a streak then stands in for. */
  rating: { change: number; games: number } | null
}

/**
 * The player's standing in one line under the greeting: their record, win rate, how their rating moved, their place,
 * then their latest results and the armies in them.
 *
 * Each figure opens where it is broken down. A skeleton of the same height holds the
 * line while the record is folded, so the page does not jump when it arrives.
 */
export function HomeRecord({
  userId,
  data,
  form,
  className,
}: {
  userId: string
  data: HomeRecordData | undefined
  form: HomeForm
  className?: string
}) {
  if (!data) return <Skeleton className={cn('h-6 max-w-xl rounded-md', className)} aria-label="Loading your record" />
  const { record, rank } = data
  if (!record.battles) {
    return <p className={cn('text-sm text-dim', className)}>Your record starts with your first finished battle.</p>
  }
  const { rating } = form
  const profile = { to: '/users/$userId', params: { userId }, className: FIGURE } as const
  const leaderboard = { to: '/leaderboard', search: { faction: undefined }, className: FIGURE } as const
  return (
    <section
      aria-label="Your record"
      data-home-record
      className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-dim', className)}
    >
      <Link {...profile}>
        <span className="figure text-base font-bold">
          <span className="text-achieved">{record.won}</span>
          <span className="text-faint">–</span>
          <span className="text-dim">{record.drawn}</span>
          <span className="text-faint">–</span>
          <span className="text-rust">{record.lost}</span>
        </span>{' '}
        record
      </Link>
      <Link {...profile}>
        <span className="figure text-base font-bold text-bone">{Math.round(record.rate * 100)}%</span> won
      </Link>
      {rating ? (
        <Link {...leaderboard}>
          <span
            className={`figure text-base font-bold ${rating.change > 0 ? 'text-achieved' : rating.change < 0 ? 'text-rust' : 'text-dim'}`}
          >
            {rating.change > 0 ? '+' : ''}
            {rating.change}
          </span>{' '}
          rating over {countLabel(rating.games, 'game')}
        </Link>
      ) : record.currentStreak ? (
        <Link {...profile}>
          <span className="figure text-base font-bold text-bone">{record.currentStreak}</span> wins in a row
        </Link>
      ) : null}
      <Link {...leaderboard}>
        {rank ? (
          <>
            <span className="figure text-base font-bold text-bone">#{rank.place}</span> of {rank.of}
          </>
        ) : (
          'Unranked'
        )}
      </Link>
      {form.outcomes.length ? (
        <span
          className="flex gap-1"
          aria-label={`Latest results: ${form.outcomes.map((outcome) => battleOutcomeStage(outcome).name).join(', ')}`}
        >
          {form.outcomes.map((outcome, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- A form guide's slots are positions: the newest result is always first.
            <ResultLetter key={index} outcome={outcome} />
          ))}
        </span>
      ) : null}
      {form.armies.length ? (
        <ul aria-label="Armies you played lately" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {form.armies.map(({ faction, battles }) => (
            <li key={faction.slug} className="flex min-w-0 items-center gap-1.5">
              <FactionMark faction={faction} size="sm" />
              <span className="truncate text-bone/85">{faction.displayName}</span>
              <span className="readout text-xs text-faint">{battles}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

const FIGURE = 'transition-colors hover:text-bone'
