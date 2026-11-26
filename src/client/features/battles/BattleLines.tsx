import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { battleColours } from '../../../core/playerColours'
import type { BattleOutcome } from '../../../core/standings'
import { sideLost, sideWon, viewerStage } from '../../battleStage'
import { summarySides, type SummarySide } from '../../battleSummary'
import { FactionMark } from '../../components/FactionMark'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { RatingChange } from '../../components/RatingChange'
import { BattleColoursProvider, PlayerTint } from '../battle/battleColours'
import { tint } from '../battle/battleTints'
import type { Battle } from './battle'

const LETTER: Record<BattleOutcome, string> = { won: 'W', lost: 'L', drawn: 'D' }

const LETTER_TINT: Record<BattleOutcome, string> = {
  won: 'bg-achieved text-void',
  lost: 'text-rust inset-ring-[1.5px] inset-ring-rust',
  drawn: 'text-dim inset-ring-[1.5px] inset-ring-runner-hi',
}

/** One result as a letter tile, the way a form guide prints it; the caller names it for assistive technology. */
export function ResultLetter({ outcome }: { outcome: BattleOutcome }) {
  return (
    <span aria-hidden className={cn('grid h-6 w-5.5 shrink-0 place-items-center font-display text-sm font-bold', LETTER_TINT[outcome])}>
      {LETTER[outcome]}
    </span>
  )
}

const NO_COLOURS = new Map()
const FADED = 'opacity-50'

/**
 * Battles as one dense row each between hairlines: who played whom with what, the score large in the sides' colours,
 * and what it was played for; the full cards are a link away.
 *
 * With `viewerId`, a battle the reader sat in reads from their side, and a finished one leads with how it went for them.
 */
export function BattleLines({
  battles,
  detail,
  viewerId,
}: {
  battles: readonly Battle[]
  /** What the battle was played for and when, beside the score on a wide list and under the sides on a narrow one. */
  detail: (battle: Battle) => string
  viewerId?: string
}) {
  return (
    <ul className="@container divide-y divide-edge border-y border-edge">
      {battles.map((battle) => {
        const sides = summarySides(battle)
        const [ours, theirs] = sides[1]?.seats.some(({ player }) => player.id === viewerId) ? [sides[1], sides[0]] : sides
        const stage = viewerStage(battle, viewerId)
        const colours = battleColours(
          [ours, theirs].flatMap((side) => side?.seats.map(({ player }) => ({ ...player, side: side.index })) ?? []),
        )
        const lost = (side?: SummarySide) => side !== undefined && sideLost(battle, side.index)
        const about = detail(battle)
        return (
          <li key={battle.token} style={colours?.variables}>
            <BattleColoursProvider value={colours?.players ?? NO_COLOURS}>
              <Link
                to="/battles/$token"
                params={{ token: battle.token }}
                className="flex min-h-15 min-w-0 items-center gap-3 px-2 py-2.5 transition-colors hover:bg-raised @xl:gap-4"
              >
                <span className="w-[4.75rem] shrink-0">
                  <StatusChip name={stage.name} className={stage.tint} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] leading-tight">
                    <Names battle={battle} side={ours} />
                    <span className="text-faint"> vs </span>
                    <Names battle={battle} side={theirs} />
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-dim">
                    <Armies side={ours} />
                    <span className="text-faint"> vs </span>
                    <Armies side={theirs} />
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-faint @xl:hidden">{about}</span>
                </span>
                {battle.status === 'setup' ? null : (
                  <span className="figure shrink-0 text-2xl leading-none whitespace-nowrap">
                    <Score side={ours} lost={lost(ours)} />
                    <span className="px-1 text-base text-faint">–</span>
                    <Score side={theirs} lost={lost(theirs)} />
                  </span>
                )}
                <span className="hidden w-56 shrink-0 truncate text-right text-2xs text-faint @xl:block">{about}</span>
              </Link>
            </BattleColoursProvider>
          </li>
        )
      })}
    </ul>
  )
}

/** A side's score in its colour, faded when it lost. */
function Score({ side, lost }: { side?: SummarySide; lost: boolean }) {
  return <span className={cn(side && tint(side.index).score, lost && FADED)}>{side?.score ?? 0}</span>
}

/** One side's players in their colours, the winners bolder. */
/** One side's players, each behind their avatar and in their colour, the winners bolder, with the rating a game moved when asked. */
export function Names({ battle, side, ratings = false }: { battle: Battle; side?: SummarySide; ratings?: boolean }) {
  const seats = side?.seats ?? []
  if (!side || !seats.length) return <span className="font-semibold text-faint">Open seat</span>
  return (
    <span className={sideWon(battle, side.index) ? 'font-bold' : 'font-semibold'}>
      {seats.map(({ player, ratingChange }, index) => (
        <span key={player.id || player.name}>
          {index ? <span className="font-normal text-faint">{index === seats.length - 1 ? ' & ' : ', '}</span> : null}
          <PlayerAvatar name={player.name} image={player.image} className="mr-1.5 size-5 align-middle text-3xs" />
          <PlayerTint playerId={player.id} className={tint(side.index).text}>
            {player.name}
          </PlayerTint>
          {ratings && ratingChange !== null ? (
            <>
              {' '}
              <RatingChange change={ratingChange} />
            </>
          ) : null}
        </span>
      ))}
    </span>
  )
}

/**
 * The armies one side brought, each behind its faction's mark and in its own span so a roster name reads as itself.
 * A row has room for the faction only, so the detachments wait in its tooltip and on the battle itself.
 */
export function Armies({ side }: { side?: SummarySide }) {
  const seats = side?.seats ?? []
  if (!seats.length) return <span className="text-faint">Waiting for an opponent</span>
  return seats.map(({ player, army, faction, detachments }, index) => {
    const name = faction?.displayName ?? army ?? 'List not attached'
    return (
      <span key={player.id || player.name} title={[name, ...detachments].join(' · ')}>
        {index ? <span className="text-faint">{index === seats.length - 1 ? ' & ' : ', '}</span> : null}
        {faction ? <FactionMark faction={faction} className="mr-1 size-4 align-[-0.2em]" /> : null}
        <span>{name}</span>
      </span>
    )
  })
}

/** Where a game stands, or how it went for the viewer, as a word in its colour rather than a mark to decode. */
export function StatusChip({ name, className }: { name: string; className: string }) {
  return (
    <span
      className={cn(
        'block rounded-sm border border-current/50 px-1 text-center text-2xs leading-5 font-semibold whitespace-nowrap',
        className,
      )}
    >
      {name}
    </span>
  )
}
