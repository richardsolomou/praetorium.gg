import type { MissionAction } from '../../contracts/missions'
import { missionActionText } from '../missionActionReminders'
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
import { SourceTextPrompt } from './SourceTextPrompt'
import { textGap, useSourceTexts } from '../sourceText'
import type { TextSourceChoice } from '../rulesText'
import { groupBy } from '../../core/collections'

/**
 * What a card asks for and what it pays, as the pack prints it, with the actions it names.
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
  card: { name: string; text: string | null; awards: Award[]; actions?: readonly MissionAction[] }
  /** The chip naming what kind of card this is; omit it when the page already says so. */
  type?: string
  /** The side's secondary mode, when it is known. Unset shows every way it can pay. */
  mode?: string
}) {
  const groups = groupBy(
    card.awards.filter((candidate) => appliesInMode(candidate, mode)),
    groupKey,
  )
  const actions = card.actions ?? []
  const texts = [card.text, ...card.awards.map(conditionLabel), ...actions.map(missionActionText)]
  const { choice } = useSourceTexts(texts)
  // One ask for the card, rather than one in place of every condition and action it prints.
  const gap = textGap(texts, choice)
  return (
    <article className="space-y-4">
      {type ? <span className="chip">{type}</span> : null}
      {gap ? <SourceTextPrompt missing={gap.missing} source={gap.needs} className="block" /> : null}
      {readable(card.text, choice) ? <RuleText text={card.text!} className="mt-0 text-base text-bone" /> : null}
      {groups.size || actions.length ? (
        <ul className="runner gap-3 [--gate-x:1.125rem] [--gate-y:1.625rem]">
          {[...groups.values()].map((awards) => (
            <ScoringBlock key={groupKey(awards[0]!)} awards={awards} choice={choice} />
          ))}
          {actions.map((action) => (
            <ActionBlock key={action.name} action={action} choice={choice} />
          ))}
        </ul>
      ) : null}
    </article>
  )
}

/** Whether a text's words are here to show; until they are, the card's one prompt stands in for them. */
const readable = (text: string | null, choice: TextSourceChoice) => text !== null && textGap([text], choice) === null

function ScoringBlock({ awards, choice }: { awards: Award[]; choice: TextSourceChoice }) {
  const first = awards[0]
  if (!first) return null
  const round = roundLabel(first.trigger)
  const timing = timingLabel(first.trigger)
  return (
    <li className="part p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {timing ? (
          <p className="font-display text-sm leading-tight font-bold tracking-heading text-bone uppercase">
            <span className="mr-1.5 font-sans text-2xs font-semibold tracking-label text-dim">When</span>
            {timing}
          </p>
        ) : null}
        {first.mode || round ? (
          <span className="flex flex-wrap gap-1">
            {first.mode ? <span className="chip">{title(first.mode)}</span> : null}
            {round ? <span className="chip">{round}</span> : null}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 -mb-2.5">
        {awards.map((award, at) => {
          const join = payoutJoin(award, awards[at - 1])
          return (
            <div key={`${award.vp}-${award.criteria ?? at}`}>
              {join ? <AwardJoin join={join} /> : null}
              <div className="flex items-baseline justify-between gap-6 py-2.5">
                {readable(conditionLabel(award), choice) ? (
                  <RuleText text={conditionLabel(award)!} className="mt-0 min-w-0 text-base text-bone" />
                ) : (
                  <p className="min-w-0 text-base text-bone">{payoutLabel(award, awards)}</p>
                )}
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
 * Written out the way a stratagem is, in the pack's own words and in the order it
 * prints them. A line the pack does not state is left out rather than shown empty,
 * so an action with no restriction states none.
 */
function ActionBlock({ action, choice }: { action: MissionAction; choice: TextSourceChoice }) {
  const text = missionActionText(action)
  return (
    <li className="part p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="chip">Action</span>
        <span className="font-display text-sm leading-tight font-bold tracking-heading text-bone uppercase">{action.name}</span>
      </p>
      {text && readable(text, choice) ? <RuleText text={text} className="mt-3 space-y-3 text-base text-bone" /> : null}
    </li>
  )
}
