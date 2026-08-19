import { Plus } from 'lucide-react'
import { conditionLabel, groupKey, type MissionAward as Award, payoutLabel, roundLabel, timingLabel, title } from '../missionText'
import { RuleText } from './RuleText'

export function MissionCardReference({ card, type }: { card: { name: string; text: string | null; awards: Award[] }; type: string }) {
  const groups = new Map<string, Award[]>()
  for (const award of card.awards) {
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
      {card.text ? (
        <div className="italic">
          <RuleText text={card.text} />
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {[...groups.values()].map((awards) => (
          <ScoringBlock key={groupKey(awards[0])} awards={awards} />
        ))}
      </div>
    </article>
  )
}

function ScoringBlock({ awards }: { awards: Award[] }) {
  const first = awards[0]
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
      <div className="mt-3 divide-y divide-edge">
        {awards.map((award, at) => (
          <div key={`${award.vp}-${award.criteria ?? at}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <p className="text-base text-bone">
              {award.cumulative ? <Plus className="mr-2 inline size-4" /> : null}
              <RuleText text={conditionLabel(award) ?? payoutLabel(award, awards)} className="mt-0 inline text-base text-bone" />
            </p>
            <span className="chip shrink-0 text-lg text-bone">
              {award.cumulative ? '+' : ''}
              {award.vp} VP
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
