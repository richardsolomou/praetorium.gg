import type { MissionAction } from '../../server/missionActions'
import {
  appliesInMode,
  conditionLabel,
  groupKey,
  type MissionAward as Award,
  payoutJoin,
  payoutLabel,
  roundLabel,
  timingLabel,
  title,
} from '../missionText'
import { RuleText } from './RuleText'

/**
 * What a card asks for and what it pays, as the pack prints it.
 *
 * A few secondaries pay differently depending on how the side draws its cards, and
 * the pack prints both. Once a side has settled on fixed or tactical, only one of
 * them is a rule that side can use — so a known mode shows that one alone rather
 * than making a player work out which half of the card is theirs.
 */
export function MissionCardReference({
  card,
  type,
  mode,
}: {
  card: { name: string; text: string | null; awards: Award[]; actions: MissionAction[] }
  type: string
  /** The side's secondary mode, when it is known. Unset shows every way it can pay. */
  mode?: string
}) {
  const groups = new Map<string, Award[]>()
  const shown = card.awards.filter((candidate) => appliesInMode(candidate, mode))
  for (const award of shown) {
    const key = [
      award.mode,
      award.trigger.timing,
      award.trigger.phase,
      award.trigger.playerTurn,
      award.trigger.roundMin,
      award.trigger.roundMax,
    ].join('|')
    groups.set(key, [...(groups.get(key) ?? []), award])
  }
  return (
    <article>
      <span className="chip">{type}</span>
      <div className="mt-4 space-y-3">
        {[...groups.values()].map((awards) => (
          <ScoringBlock key={groupKey(awards[0]!)} awards={awards} />
        ))}
        {card.actions.map((action) => (
          <ActionBlock key={action.name} action={action} />
        ))}
      </div>
    </article>
  )
}

function ScoringBlock({ awards }: { awards: Award[] }) {
  const first = awards[0]
  if (!first) return null
  const round = roundLabel(first.trigger.roundMin, first.trigger.roundMax)
  const timing = timingLabel(first.trigger)
  return (
    <div className="border border-edge bg-sunken p-3">
      <div className="flex flex-wrap gap-1">
        {first.mode ? <span className="chip">{title(first.mode)}</span> : null}
        <span className="chip">{round}</span>
      </div>
      {timing ? (
        <p className="mt-3 text-base font-semibold text-bone">
          <span className="font-bold uppercase">When:</span> {timing}
        </p>
      ) : null}
      <div className="mt-3">
        {awards.map((award, at) => {
          const join = payoutJoin(award, awards[at - 1])
          return (
            <div key={`${award.vp}-${award.criteria ?? at}`}>
              {join ? <AwardJoin join={join} /> : null}
              <div className="flex items-center justify-between gap-4 py-2">
                <div className="text-base text-bone">
                  <RuleText text={conditionLabel(award) ?? payoutLabel(award, awards)} className="mt-0 inline text-base text-bone" />
                </div>
                <span className="chip shrink-0 text-lg text-bone">{award.vp} VP</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The action the card names, which is how most of what it pays is earned.
 *
 * Written out the way a stratagem is, in the pack's own words and in the order it
 * prints them, beneath the payouts that depend on it. A line the pack does not state
 * is left out rather than shown empty, so an action with no restriction states none.
 */
function ActionBlock({ action }: { action: MissionAction }) {
  const lines: [string, string | null][] = [
    ['Starts', action.starts],
    ['Completes', action.completes],
    ['Effect', action.effect],
    ['Units', action.units],
    ['Use limit', action.useLimit],
    ['Restriction', action.restriction],
  ]
  const text = lines.flatMap(([label, line]) => (line ? [`**${label}:** ${line}`] : [])).join('\n\n')
  return (
    <div className="border border-edge bg-sunken p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="chip">Action</span>
        <span className="text-base font-bold text-bone uppercase">{action.name}</span>
      </div>
      {text ? <RuleText text={text} className="mt-3 text-base text-bone" /> : null}
    </div>
  )
}

/** Whether the next condition replaces the one above or can score alongside it. */
function AwardJoin({ join }: { join: 'or' | 'plus' }) {
  return (
    <div className="flex items-center gap-2 py-1" aria-label={join === 'or' ? 'Alternative objective' : 'Additional objective'}>
      <span className="h-px flex-1 bg-edge" />
      <span className="chip shrink-0 border-edge-strong px-1 text-faint">{join}</span>
      <span className="h-px flex-1 bg-edge" />
    </div>
  )
}
