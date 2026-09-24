import { Link } from '@tanstack/react-router'
import { battleStage } from '../../battleStage'
import { summarySides, type SummarySide } from '../../battleSummary'
import { FactionMark } from '../../components/FactionMark'
import type { Battle } from '../battles/battle'
import type { OnboardingTarget } from '../onboarding/onboarding'

/**
 * Other people's battles, one line each: where the game is, who is at the table, and the score.
 *
 * A game the reader is not sitting in is something to glance at and maybe open, so it
 * gets a line rather than the scoreboard card the reader's own games keep. The full
 * table is one click away on the battle itself.
 */
export function HomeFeed({ title, battles, onboarding }: { title: string; battles: readonly Battle[]; onboarding?: OnboardingTarget }) {
  if (!battles.length) return null
  return (
    <section data-onboarding={onboarding} data-home-feed={title}>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{battles.length}</span>
      </p>
      <ul className="divide-y divide-edge border-b border-edge">
        {battles.map((battle) => {
          const [ours, theirs] = summarySides(battle)
          const stage = battleStage(battle.status)
          return (
            <li key={battle.token}>
              <Link
                to="/battles/$token"
                params={{ token: battle.token }}
                aria-label={`Watch ${battle.players.join(' versus ')}`}
                // A phone reads the stage and score on one line and each side on its own below;
                // a wider screen lays all four out along one line.
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 -mx-3 px-3 py-3 hover:bg-raised sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_minmax(0,1fr)]"
              >
                <span className={`eyebrow ${stage.tint}`}>{stage.name}</span>
                <Side side={ours} className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                <span className="readout order-2 justify-self-end text-sm sm:order-none sm:justify-self-auto">
                  <span className="text-side-a">{ours?.score ?? 0}</span>
                  <span className="text-faint"> – </span>
                  <span className="text-side-b">{theirs?.score ?? 0}</span>
                </span>
                <Side side={theirs} className="order-4 col-span-2 sm:order-none sm:col-span-1 sm:flex-row-reverse sm:text-right" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Side({ side, className }: { side?: SummarySide; className: string }) {
  const faction = side?.seats.find((seat) => seat.faction)?.faction
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      {faction ? <FactionMark id={faction.slug} icon={faction.icon} size="sm" /> : null}
      <span className="truncate text-sm font-bold uppercase">{side?.seats.map((seat) => seat.player.name).join(' & ') || 'Unknown'}</span>
    </span>
  )
}
