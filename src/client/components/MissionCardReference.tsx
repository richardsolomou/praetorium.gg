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
import { RuleSummaryLoading, RuleSummaryText } from './RuleSummaryText'
import { useMissionSummary, useRuleSummary } from '../ruleSummaries'
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
 * Each scoring window and each action is a part hung off one runner, in the order the
 * pack prints them, so a card reads the same in a dialog, a matchup column or its own page.
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
      {type ? <span className="chip">{type}</span> : null}
      {summary ? (
        <RuleSummaryText summary={summary} className="mt-0 text-base text-bone" />
      ) : pending ? (
        <RuleSummaryLoading className="mt-0" />
      ) : null}
      {groups.size || actions.length ? (
        <ul className="runner gap-3 [--gate-x:1.125rem] [--gate-y:1.625rem]">
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

/** Payouts claimed at the same moments, each printed once under every moment it is claimed at. */
function ScoringBlock({ entries }: { entries: ReturnType<typeof awardsOnce> }) {
  const first = entries[0]
  if (!first) return null
  const awards = entries.map((entry) => entry.award)
  return (
    <li className="part p-4">
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
              <p className="font-display text-sm leading-tight font-bold tracking-heading text-bone uppercase">
                <span className="mr-1.5 font-sans text-2xs font-semibold tracking-label text-dim">{at ? 'Or' : 'When'}</span>
                {timing}
              </p>
            ) : null}
            {mode || round ? (
              <span className="flex flex-wrap gap-1">
                {mode ? <span className="chip">{title(mode)}</span> : null}
                {round ? <span className="chip">{round}</span> : null}
              </span>
            ) : null}
          </div>
        )
      })}
      <div className="mt-1.5 -mb-2.5">
        {awards.map((award, at) => {
          const join = payoutJoin(award, awards[at - 1])
          return (
            <div key={`${award.vp}-${award.criteria ?? at}`}>
              {join ? <AwardJoin join={join} /> : null}
              <div className="flex items-baseline justify-between gap-6 py-2.5">
                <AwardCondition award={award} className="mt-0 min-w-0 text-base text-bone" />
                <span className="figure shrink-0 text-xl leading-none font-semibold text-bone">
                  {award.vp}
                  <span className="font-sans text-2xs font-semibold tracking-label text-dim"> VP</span>
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
  if (byId.pending || byToken.pending) return <RuleSummaryLoading className={className} />
  return <span className="min-w-0 flex-1" />
}

/** Whether the next condition replaces the one above or can score alongside it. */
function AwardJoin({ join }: { join: 'or' | 'plus' }) {
  return (
    <div className="flex items-center gap-2" aria-label={join === 'or' ? 'Alternative objective' : 'Additional objective'}>
      <span className="h-px flex-1 bg-edge" />
      <span className="text-3xs font-semibold tracking-label text-faint uppercase">{join}</span>
      <span className="h-px flex-1 bg-edge" />
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
    <li className="part p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="chip">Action</span>
        <span className="font-display text-sm leading-tight font-bold tracking-heading text-bone uppercase">{action.name}</span>
      </p>
      {summary ? (
        <RuleSummaryText summary={summary} className="mt-3 space-y-3 text-base text-bone" />
      ) : pending ? (
        <RuleSummaryLoading className="mt-3" />
      ) : null}
    </li>
  )
}
