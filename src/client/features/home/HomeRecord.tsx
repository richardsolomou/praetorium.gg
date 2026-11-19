import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ServiceRecord } from '../../../core/serviceRecord'
import type { BattleOutcome } from '../../../core/standings'
import { battleOutcomeStage } from '../../battleStage'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { countLabel } from '../../text'
import { ResultLetter } from '../battles/BattleLines'
import { HeaderFact } from '../../components/HeaderFact'

/** The player's record as their profile counts it, and their overall leaderboard place if they have one. */
export type HomeRecordData = {
  record: Pick<ServiceRecord, 'battles' | 'won' | 'lost' | 'drawn' | 'rate' | 'currentStreak'>
  rank: { place: number; of: number } | null
}

/** What the player's latest finished games say beside the record: how they went, newest first, the army in most of them, and how far they moved the player's rating. */
export type HomeForm = {
  outcomes: readonly BattleOutcome[]
  main: { faction: FactionPresentation; battles: number } | null
  /** Null until a game has moved the rating, which a streak then stands in for. */
  rating: { change: number; games: number } | null
}

/**
 * The player's standing under the greeting, as the same row of facts a profile opens with: their record, win rate,
 * how their rating moved, their place, their latest results and the army they bring most.
 *
 * Each fact opens where it is broken down. A skeleton of the same height holds the
 * row while the record is folded, so the page does not jump when it arrives.
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
  if (!data) return <Skeleton className={cn('h-15 max-w-xl rounded-lg', className)} aria-label="Loading your record" />
  const { record, rank } = data
  if (!record.battles) {
    return <p className={cn('text-sm text-dim', className)}>Your record starts with your first finished battle.</p>
  }
  const { rating, main } = form
  const profile = { to: '/users/$userId', params: { userId }, className: FACT } as const
  const leaderboard = { to: '/leaderboard', search: { faction: undefined }, className: FACT } as const
  return (
    <section aria-label="Your record" data-home-record className={cn('flex flex-wrap items-stretch gap-2', className)}>
      <Link {...profile}>
        <HeaderFact label="Record">
          <span className="figure text-sm font-bold">
            <span className="text-achieved">{record.won}</span>
            <span className="text-faint">–</span>
            <span className="text-dim">{record.drawn}</span>
            <span className="text-faint">–</span>
            <span className="text-rust">{record.lost}</span>
          </span>
        </HeaderFact>
      </Link>
      <Link {...profile}>
        <HeaderFact label="Won">
          <span className="figure text-sm font-bold text-bone">{Math.round(record.rate * 100)}%</span>
        </HeaderFact>
      </Link>
      {rating ? (
        <Link {...leaderboard}>
          <HeaderFact label="Rating">
            <span className="figure text-sm font-bold">
              <span className={rating.change > 0 ? 'text-achieved' : rating.change < 0 ? 'text-rust' : 'text-dim'}>
                {rating.change > 0 ? '+' : ''}
                {rating.change}
              </span>
              <span className="font-normal text-faint"> in {countLabel(rating.games, 'game')}</span>
            </span>
          </HeaderFact>
        </Link>
      ) : record.currentStreak ? (
        <Link {...profile}>
          <HeaderFact label="Streak">
            <span className="figure text-sm font-bold text-bone">
              {record.currentStreak}
              <span className="font-normal text-faint"> wins in a row</span>
            </span>
          </HeaderFact>
        </Link>
      ) : null}
      <Link {...leaderboard}>
        <HeaderFact label="Leaderboard">
          {rank ? (
            <span className="figure text-sm font-bold text-bone">
              #{rank.place}
              <span className="font-normal text-faint"> of {rank.of}</span>
            </span>
          ) : (
            <span className="text-sm font-bold text-dim">Unranked</span>
          )}
        </HeaderFact>
      </Link>
      {form.outcomes.length ? (
        <HeaderFact label="Form">
          <span
            className="flex gap-1"
            aria-label={`Latest results: ${form.outcomes.map((outcome) => battleOutcomeStage(outcome).name).join(', ')}`}
          >
            {form.outcomes.map((outcome, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- A form guide's slots are positions: the newest result is always first.
              <ResultLetter key={index} outcome={outcome} />
            ))}
          </span>
        </HeaderFact>
      ) : null}
      {main ? (
        <HeaderFact label="Plays most">
          <span className="flex items-center gap-1.5 text-sm font-bold text-bone uppercase">
            <FactionMark faction={main.faction} size="sm" />
            {main.faction.displayName}
            <span className="readout text-xs font-normal text-faint">{main.battles}</span>
          </span>
        </HeaderFact>
      ) : null}
    </section>
  )
}

const FACT = 'flex [&>span]:transition-colors [&>span]:hover:border-runner [&>span]:hover:bg-raised'
