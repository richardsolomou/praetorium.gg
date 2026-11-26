import type { MissionAction } from '../../contracts/missions'
import {
  appliesInMode,
  conditionLabel,
  groupKey,
  type MissionAward as Award,
  payoutJoin,
  roundLabel,
  timingLabel,
  title,
} from '../missionText'
import { RuleSummarySkeleton, RuleSummaryText } from './RuleSummaryText'
import { useMissionSummary, useRuleSummary } from '../ruleSummaries'
import { OUTLINE_TAG } from './rosterSetup'
import { groupBy } from '../../core/collections'
import { awardsOnce } from '../../core/scoring'

/**
 * What a card asks for and what it pays, as its summaries say it, with the actions it names.
 *
 * A few secondaries pay differently depending on how the side draws its cards, and
 * the pack prints both. Once a side has settled on fixed or tactical, only one of
 * them is a rule that side can use — so a known mode shows that one alone rather
 * than making a player work out which half of the card is theirs.
 *
 * Each scoring window and each action is a hairline row, in the order the pack prints
 * them, so a card reads the same in a dialog, a matchup column or its own page.
 */
export function MissionCardReference({
  card,
  type,
  mode,
}: {
  card: { key: string; name: string; awards: Award[]; actions?: readonly MissionAction[] }
  /** The chip naming what kind of card this is; omit it when the page already says so. */
  type?: string
  /** The side's secondary mode, when it is known. Unset shows every way it can pay. */
  mode?: string
}) {
  const groups = groupBy(awardsOnce(card.awards.filter((candidate) => appliesInMode(candidate, mode))), groupKey)
  const actions = card.actions ?? []
  const { summary, pending } = useMissionSummary('mission-card', card.key)
  return (
    <article className="space-y-4">
      {type ? <span className={TAG}>{type}</span> : null}
      {summary ? (
        <RuleSummaryText summary={summary} className="mt-0 text-base text-bone" />
      ) : pending ? (
        <RuleSummarySkeleton className="mt-0" />
      ) : null}
      {groups.size || actions.length ? (
        <ul className={V.list}>
          {[...groups].map(([key, awards]) => (
            <ScoringBlock key={key} entries={awards} />
          ))}
          {actions.map((action) => (
            <ActionBlock key={action.id} action={action} />
          ))}
        </ul>
      ) : null}
    </article>
  )
}

const TAG = `${OUTLINE_TAG} border-edge text-dim`

/** Each condition and action is its own card on the page's background, so neighbouring blocks never read as one. */
const V = {
  list: 'space-y-3',
  block: 'rounded-lg border border-edge px-4 pt-3 pb-1',
  head: 'space-y-1.5',
  body: 'mt-1',
  timing: 'text-base leading-tight font-semibold text-bone',
  label: 'mr-1.5 text-xs font-normal text-dim',
}

/** Payouts claimed at the same moments, each printed once under every moment it is claimed at. */
function ScoringBlock({ entries }: { entries: ReturnType<typeof awardsOnce> }) {
  const first = entries[0]
  if (!first) return null
  const awards = entries.map((entry) => entry.award)
  return (
    <li className={V.block}>
      <div className={V.head}>
        {first.triggers.map((trigger, at) => {
          const round = roundLabel(trigger)
          const timing = timingLabel(trigger)
          const mode = at === 0 ? first.award.mode : null
          return (
            <div
              key={`${trigger.timing}-${trigger.phase}-${trigger.roundMin}`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
            >
              {timing ? (
                <p className={V.timing}>
                  <span className={V.label}>{at ? 'Or' : 'When'}</span>
                  {timing}
                </p>
              ) : null}
              {mode || round ? (
                <span className="flex flex-wrap gap-1">
                  {mode ? <span className={TAG}>{title(mode)}</span> : null}
                  {round ? <span className={TAG}>{round}</span> : null}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className={V.body}>
        {awards.map((award, at) => {
          const join = payoutJoin(award, awards[at - 1])
          return (
            <div key={`${award.vp}-${award.criteria ?? at}`}>
              {join ? <AwardJoin join={join} /> : null}
              <div className="flex items-baseline justify-between gap-6 py-3">
                <AwardCondition award={award} className="mt-0 min-w-0 text-base text-bone" />
                <span className="figure shrink-0 text-2xl leading-none text-bone">
                  {award.vp}
                  <span className="font-sans text-xs font-normal text-dim"> VP</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </li>
  )
}

/** What an award asks for: its summary, by its VS Data ID or the token a battle saved, and nothing where it has none. */
export function AwardCondition({ award, className }: { award: Award; className: string }) {
  const byId = useMissionSummary('mission-award', award.id)
  const byToken = useRuleSummary(conditionLabel(award) ?? '')
  const summary = byId.summary ?? byToken.summary
  if (summary) return <RuleSummaryText summary={summary} className={className} />
  // A row lays its summary out beside the VP, where only a growing skeleton has width.
  if (byId.pending || byToken.pending) return <RuleSummarySkeleton className={`${className} flex-1`} />
  return <span className="min-w-0 flex-1" />
}

/** Whether the next condition replaces the one above or can score alongside it. */
function AwardJoin({ join }: { join: 'or' | 'plus' }) {
  return (
    <div className="flex items-center gap-2" aria-label={join === 'or' ? 'Alternative objective' : 'Additional objective'}>
      <span className="h-px flex-1 bg-edge/60" />
      <span className="text-2xs text-faint">{join}</span>
      <span className="h-px flex-1 bg-edge/60" />
    </div>
  )
}

/**
 * An action the card names, which is how most of what it pays is earned.
 *
 * Its summary, where VS Data writes one; an action without one shows its name alone.
 */
function ActionBlock({ action }: { action: MissionAction }) {
  const { summary, pending } = useMissionSummary('mission-action', action.id)
  return (
    <li className={V.block}>
      <p className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${V.head}`}>
        <span className={V.label}>Action</span>
        <span className={V.timing}>{action.name}</span>
      </p>
      {summary ? (
        <RuleSummaryText summary={summary} className={`${V.body} mt-3 space-y-3 pb-2 text-base text-bone`} />
      ) : pending ? (
        <RuleSummarySkeleton className={`${V.body} mt-3`} />
      ) : null}
    </li>
  )
}
