import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { battleOutcome } from '../../../core/standings'
import { summarySides } from '../../battleSummary'
import { FactionMark } from '../../components/FactionMark'
import { formatDate } from '../../dates'
import type { Battle } from '../battles/battle'

const OUTCOME = {
  won: { name: 'Won', tint: 'text-achieved' },
  lost: { name: 'Lost', tint: 'text-rust' },
  drawn: { name: 'Drawn', tint: 'text-dim' },
} as const

/**
 * The player's last few results, one line each: how it went, who against, and the score.
 *
 * A finished game is read once, so it gets a line rather than the scoreboard a live
 * game needs. The outcome is `battleOutcome`, the fold the leaderboard and the
 * profile count, so this line cannot call a game differently from either.
 */
export function HomePlayed({ played, viewerId }: { played: readonly Battle[]; viewerId: string }) {
  if (!played.length) return null
  return (
    <section data-home-played>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Games you have played</span>
        <span className="readout">{played.length}</span>
      </p>
      <ul className="divide-y divide-edge border-b border-edge">
        {played.map((battle) => {
          const side = battle.sides[battle.playerIds.indexOf(viewerId)]
          const sides = summarySides(battle)
          const ours = sides.find((entry) => entry.index === side)
          const theirs = sides.filter((entry) => entry.index !== side)
          const opponent = theirs.flatMap((entry) => entry.seats)
          const faction = opponent.find((seat) => seat.faction)?.faction
          const outcome = side === undefined ? null : OUTCOME[battleOutcome(battle, side)]
          return (
            <li key={battle.token}>
              <Link
                to="/battles/$token"
                params={{ token: battle.token }}
                className="flex min-w-0 items-center gap-2 -mx-3 px-3 py-3 hover:bg-raised"
              >
                <span className={`eyebrow w-11 shrink-0 ${outcome?.tint ?? 'text-faint'}`}>{outcome?.name ?? 'Ended'}</span>
                {faction ? <FactionMark id={faction.slug} icon={faction.icon} size="sm" /> : null}
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-faint">vs </span>
                  <span className="font-bold uppercase">{opponent.map((seat) => seat.player.name).join(' & ') || 'Unknown'}</span>
                </span>
                <span className="readout shrink-0 text-xs text-faint">{formatDate(battle.lastActivity)}</span>
                <span className="readout shrink-0 text-sm text-dim">
                  {ours?.score ?? 0}–{Math.max(0, ...theirs.map((entry) => entry.score))}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Link to="/battles" className="eyebrow mt-2 inline-flex items-center gap-1 text-info hover:text-parchment">
        All my battles <ChevronRight className="size-3.5" />
      </Link>
    </section>
  )
}
