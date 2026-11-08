import { ACHIEVEMENT_TIERS, ACHIEVEMENTS, latestAchievements, type EarnedAchievements } from '../../../core/achievements'
import { HoverTooltip } from '../../components/HoverTooltip'
import { useDateFormatting } from '../../dates'
import { AchievementBadge } from './AchievementBadge'

const TOTAL = ACHIEVEMENTS.reduce((sum, achievement) => sum + ACHIEVEMENT_TIERS[achievement.tier], 0)
const LATEST_MEDALS = 3
const TIER_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' } as const

/**
 * The player's latest medals, then every achievement there is as one grid of slots, always in the same order,
 * with the ones this player has earned struck in metal; a medal's frame and metal show its tier.
 */
export function AchievementsPanel({ achievements }: { achievements: EarnedAchievements }) {
  const dates = useDateFormatting()
  const count = Object.keys(achievements.earned).length
  const latest = latestAchievements(achievements.earned, LATEST_MEDALS)
  return (
    <div className="space-y-3">
      <p className="text-sm text-dim">
        <span className="figure font-bold text-bone">{count}</span> of {ACHIEVEMENTS.length} earned ·{' '}
        <span className="figure font-bold text-bone">{achievements.points}</span> of {TOTAL} points
      </p>
      {latest.length ? (
        <section className="space-y-1.5" data-latest-medals>
          <h2 className="eyebrow text-faint">Latest</h2>
          <ul className="grid gap-1 sm:grid-cols-3">
            {latest.map(({ achievement, at }) => (
              <li key={achievement.id} className="flex items-center gap-2.5 border border-edge bg-sunken p-2">
                <AchievementBadge
                  metric={achievement.metric}
                  count={achievement.count}
                  tier={achievement.tier}
                  earned
                  className="size-11 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-bone uppercase">{achievement.name}</span>
                  <span className="block text-xs text-dim">{achievement.goal}</span>
                  <span className="block text-xs text-faint">{dates.date(at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1">
        {ACHIEVEMENTS.map((achievement) => {
          const at = achievements.earned[achievement.id]
          const worth = `${TIER_NAMES[achievement.tier]} · ${ACHIEVEMENT_TIERS[achievement.tier]} points`
          const status = at === undefined ? 'Not earned yet' : at === null ? 'Earned' : `Earned ${dates.date(at)}`
          return (
            <li key={achievement.id} data-achievement={achievement.id} data-earned={at !== undefined}>
              <HoverTooltip
                title={achievement.name}
                body={<p>{achievement.goal}</p>}
                note={`${worth} · ${status}`}
                label={`${achievement.name}, ${at === undefined ? 'not earned' : 'earned'}`}
                className={`h-full w-full flex-col justify-start gap-1 border px-1 pt-2 pb-1.5 no-underline transition-colors hover:border-edge-strong hover:bg-raised ${at === undefined ? 'border-edge/60 bg-sunken/40' : 'border-edge bg-sunken'}`}
              >
                <AchievementBadge
                  metric={achievement.metric}
                  count={achievement.count}
                  tier={achievement.tier}
                  earned={at !== undefined}
                  className="size-11"
                />
                <span
                  className={`line-clamp-2 w-full text-3xs leading-tight font-bold uppercase [overflow-wrap:anywhere] ${at === undefined ? 'text-faint' : 'text-bone'}`}
                >
                  {achievement.name}
                </span>
              </HoverTooltip>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
