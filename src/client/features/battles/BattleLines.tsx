import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { battleColours } from '../../../core/playerColours'
import { type BattleOutcome, playerOutcome } from '../../../core/standings'
import { battleOutcomeStage, sideLost, sideWon } from '../../battleStage'
import { summarySides, type SummarySide } from '../../battleSummary'
import { FactionMark } from '../../components/FactionMark'
import { formatList } from '../../text'
import { BattleColoursProvider, PlayerTint } from '../battle/battleColours'
import { tint } from '../battle/battleTints'
import type { Battle } from './battle'

const LETTER: Record<BattleOutcome, string> = { won: 'W', lost: 'L', drawn: 'D' }

/** One result as a tinted letter, the way a form guide prints it; the caller names it for assistive technology. */
export function ResultLetter({ outcome }: { outcome: BattleOutcome }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-sm border border-current text-2xs font-bold',
        battleOutcomeStage(outcome).tint,
      )}
    >
      {LETTER[outcome]}
    </span>
  )
}

const NO_COLOURS = new Map()
const FADED = 'opacity-50'

/**
 * Battles as one slim row each: both sides with their armies in their colours, and the score between them,
 * for a page that summarises rather than lists; the full cards are a link away.
 *
 * With `viewerId`, a finished battle the reader sat in leads with how it went for them.
 */
export function BattleLines({
  battles,
  detail,
  viewerId,
}: {
  battles: readonly Battle[]
  /** The line under the score: what the battle was played for and when. */
  detail: (battle: Battle) => string
  viewerId?: string
}) {
  return (
    <ul className="@container divide-y divide-edge part">
      {battles.map((battle) => {
        const [ours, theirs] = summarySides(battle)
        const outcome = battle.status === 'finished' ? playerOutcome(battle, viewerId) : null
        const colours = battleColours(
          [ours, theirs].flatMap((side) => side?.seats.map(({ player }) => ({ ...player, side: side.index })) ?? []),
        )
        const lost = (side?: SummarySide) => side !== undefined && sideLost(battle, side.index)
        return (
          <li key={battle.token} style={colours?.variables}>
            <BattleColoursProvider value={colours?.players ?? NO_COLOURS}>
              <Link
                to="/battles/$token"
                params={{ token: battle.token }}
                className="flex min-h-15 min-w-0 items-center gap-3 px-3 py-2 transition-colors hover:bg-raised"
              >
                {outcome ? (
                  <>
                    <ResultLetter outcome={outcome} />
                    <span className="sr-only">{battleOutcomeStage(outcome).name}:</span>
                  </>
                ) : null}
                {/* A narrow list stacks the sides like a scoreboard, each score at the right; a wide one faces them across the score. */}
                <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @xl:grid-cols-[minmax(0,1fr)_6rem_1rem_6rem_minmax(0,1fr)] @xl:gap-x-0 @xl:gap-y-0.5">
                  <Side battle={battle} side={ours} lost={lost(ours)} className="@xl:row-span-2 @xl:pr-3" />
                  <Score side={ours} lost={lost(ours)} hidden={battle.status === 'setup'} className="justify-self-end" />
                  <span aria-hidden className="hidden text-center text-sm text-faint @xl:block">
                    {battle.status === 'setup' ? 'vs' : '–'}
                  </span>
                  <Side
                    battle={battle}
                    side={theirs}
                    lost={lost(theirs)}
                    mirrored
                    className="@xl:col-start-5 @xl:row-span-2 @xl:row-start-1 @xl:pl-3"
                  />
                  <Score
                    side={theirs}
                    lost={lost(theirs)}
                    hidden={battle.status === 'setup'}
                    className="@xl:col-start-4 @xl:row-start-1 justify-self-end @xl:justify-self-start"
                  />
                  <span className="col-span-2 truncate text-2xs text-faint @xl:col-span-3 @xl:col-start-2 @xl:row-start-2 @xl:text-center">
                    {detail(battle)}
                  </span>
                </span>
              </Link>
            </BattleColoursProvider>
          </li>
        )
      })}
    </ul>
  )
}

/** A side's score in its colour, faded when it lost; nothing before the battle starts. */
function Score({ side, lost, hidden, className }: { side?: SummarySide; lost: boolean; hidden: boolean; className?: string }) {
  return (
    <span className={cn('figure text-xl leading-none font-bold', side && tint(side.index).score, lost && FADED, className)}>
      {hidden ? null : (side?.score ?? 0)}
    </span>
  )
}

/** One side's players in their colours over the armies they brought; the far side mirrors so both read towards the score. */
function Side({
  battle,
  side,
  lost,
  mirrored = false,
  className,
}: {
  battle: Battle
  side?: SummarySide
  lost: boolean
  mirrored?: boolean
  className?: string
}) {
  const seats = side?.seats ?? []
  if (!side || !seats.length) {
    return <span className={cn('truncate text-sm font-bold text-faint uppercase', mirrored && '@xl:text-right', className)}>Open seat</span>
  }
  const factions = [...new Map(seats.flatMap(({ faction }) => (faction ? [[faction.slug, faction]] : []))).values()]
  const armies = seats.map(({ faction, army, detachments }) => [faction?.displayName ?? army, ...detachments].filter(Boolean).join(' · '))
  return (
    <span className={cn('flex min-w-0 items-center gap-2', mirrored && '@xl:flex-row-reverse @xl:text-right', className)}>
      {factions.length ? (
        <span className={cn('flex shrink-0 -space-x-1', lost && FADED)}>
          {factions.map((faction) => (
            <FactionMark key={faction.slug} faction={faction} size="sm" />
          ))}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className={cn('block truncate text-sm leading-tight', sideWon(battle, side.index) ? 'font-bold' : 'font-semibold')}>
          {seats.map(({ player }, index) => (
            <span key={player.id || player.name}>
              {index ? <span className="text-faint">{index === seats.length - 1 ? ' & ' : ', '}</span> : null}
              <PlayerTint playerId={player.id} className={tint(side.index).text}>
                {player.name}
              </PlayerTint>
            </span>
          ))}
        </span>
        <span className="block truncate text-2xs text-dim">
          {armies.some(Boolean) ? formatList(armies.filter(Boolean)) : 'List not attached'}
        </span>
      </span>
    </span>
  )
}
