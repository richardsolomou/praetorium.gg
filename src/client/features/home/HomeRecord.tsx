import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ServiceRecord } from '../../../core/serviceRecord'
import type { BattleOutcome } from '../../../core/standings'
import { battleOutcomeStage } from '../../battleStage'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { countLabel } from '../../text'
import { ResultLetter } from '../battles/BattleLines'
import type { ReactNode } from 'react'

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
  if (!data) return <Skeleton className={cn('h-19 rounded-none', className)} aria-label="Loading your record" />
  const { record, rank } = data
  if (!record.battles) {
    return <p className={cn('text-sm text-dim', className)}>Your record starts with your first finished battle.</p>
  }
  const { rating, main } = form
  const profile = { to: '/users/$userId', params: { userId }, className: FACT } as const
  const leaderboard = { to: '/leaderboard', search: { faction: undefined }, className: FACT } as const
  return (
    <section
      aria-label="Your record"
      data-home-record
      className={cn('grid grid-cols-2 border-y border-edge sm:flex sm:flex-wrap sm:divide-x sm:divide-edge', className)}
    >
      <Link {...profile}>
        <Fact label="Record">
          <span className="text-achieved">{record.won}</span>
          <span className="text-faint">–</span>
          <span className="text-dim">{record.drawn}</span>
          <span className="text-faint">–</span>
          <span className="text-rust">{record.lost}</span>
        </Fact>
      </Link>
      <Link {...profile}>
        <Fact label="Won">{Math.round(record.rate * 100)}%</Fact>
      </Link>
      {rating ? (
        <Link {...leaderboard}>
          <Fact label="Rating" after={`in ${countLabel(rating.games, 'game')}`}>
            <span className={rating.change > 0 ? 'text-achieved' : rating.change < 0 ? 'text-rust' : 'text-dim'}>
              {rating.change > 0 ? '+' : rating.change < 0 ? '−' : ''}
              {Math.abs(rating.change)}
            </span>
          </Fact>
        </Link>
      ) : record.currentStreak ? (
        <Link {...profile}>
          <Fact label="Streak" after="wins in a row">
            {record.currentStreak}
          </Fact>
        </Link>
      ) : null}
      <Link {...leaderboard}>
        {rank ? (
          <Fact label="Leaderboard" after={`of ${rank.of}`}>
            #{rank.place}
          </Fact>
        ) : (
          <Fact label="Leaderboard">
            <span className="text-dim">Unranked</span>
          </Fact>
        )}
      </Link>
      {form.outcomes.length ? (
        <span className={CELL}>
          <span className="eyebrow">Form</span>
          <span
            className="flex h-10 items-center gap-1"
            aria-label={`Latest results: ${form.outcomes.map((outcome) => battleOutcomeStage(outcome).name).join(', ')}`}
          >
            {form.outcomes.map((outcome, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- A form guide's slots are positions: the newest result is always first.
              <ResultLetter key={index} outcome={outcome} />
            ))}
          </span>
        </span>
      ) : null}
      {main ? (
        <span className={CELL}>
          <span className="eyebrow">Plays most</span>
          <span className="flex h-10 min-w-0 items-center gap-2 font-display text-lg font-bold text-bone sm:text-xl">
            <FactionMark faction={main.faction} size="sm" />
            <span className="truncate">{main.faction.displayName}</span>
            <span className="text-sm font-semibold text-faint">{main.battles}</span>
          </span>
        </span>
      ) : null}
    </section>
  )
}

/** A strip cell: hairlines between cells on a wide screen, a two-column grid on a phone. */
const CELL = 'flex min-w-0 flex-col gap-0.5 px-3 py-3 sm:px-5'
const FACT = cn(CELL, 'transition-colors hover:bg-raised/60')

/** One labelled figure in the strip, with a faint qualifier after it. */
function Fact({ label, after, children }: { label: string; after?: string; children: ReactNode }) {
  return (
    <>
      <span className="eyebrow">{label}</span>
      <span className="flex h-10 items-baseline gap-1.5 whitespace-nowrap">
        <span className="figure self-center text-[1.75rem] leading-none text-bone sm:text-[2rem]">{children}</span>
        {after ? <span className="self-center text-sm text-faint">{after}</span> : null}
      </span>
    </>
  )
}
