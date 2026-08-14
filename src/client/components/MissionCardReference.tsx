import { Plus } from 'lucide-react'
import { RuleText } from './RuleText'

type Award = {
  vp: number
  per: string | null
  mode: string | null
  when: string | null
  parameters: Record<string, unknown>
  cumulative: boolean
  trigger: { timing: string | null; phase: string | null; playerTurn: string | null; roundMin: number | null; roundMax: number | null }
}

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
        {awards.map((award) => (
          <div key={`${award.vp}-${award.per}-${award.when}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <p className="text-base text-bone">
              {award.cumulative ? <Plus className="mr-2 inline size-4" /> : null}
              {conditionLabel(award)}
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

function timingLabel(trigger: Award['trigger']) {
  const owner =
    trigger.playerTurn === 'your-turn'
      ? 'your'
      : trigger.playerTurn === 'opponent-turn'
        ? 'your opponent’s'
        : trigger.playerTurn === 'either'
          ? 'either player’s'
          : null
  if (trigger.timing === 'end-of-turn') return `End of ${owner ? `${owner} ` : ''}turn`
  if (trigger.timing === 'end-of-phase')
    return `End of ${owner ? `${owner} ` : ''}${trigger.phase ? `${title(trigger.phase)} phase` : 'phase'}`
  return [
    trigger.timing ? title(trigger.timing) : null,
    trigger.phase ? `${title(trigger.phase)} phase` : null,
    owner ? `${title(owner)} turn` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function conditionLabel(award: Award) {
  const per: Record<string, string> = {
    'controlled-objective': 'For each objective you control.',
    'controlled-non-home-objective': 'For each objective you control, excluding your home objective.',
    'controlled-objective-in-enemy-territory': 'For each objective you control in enemy territory.',
    'objective-newly-controlled-this-turn': 'For each objective you control that you did not control at the start of the turn.',
    'decoyed-objective': 'For each objective you have decoyed.',
    'decoyed-objective-in-enemy-territory': 'For each objective you have decoyed in enemy territory.',
    'enemy-character-model-destroyed-this-turn': 'For each enemy CHARACTER model destroyed this turn.',
    'enemy-character-model-with-wounds-4-or-more-destroyed-this-turn':
      'For each of those models with a Wounds characteristic of 4 or more.',
    'enemy-model-with-wounds-10-or-more-destroyed-this-turn':
      'For each enemy model with a Wounds characteristic of 10 or more destroyed this turn.',
    'enemy-unit-destroyed-this-turn': 'For each enemy unit destroyed this turn.',
    'enemy-unit-destroyed-that-started-the-turn-within-range-of-an-objective':
      'For each enemy unit destroyed this turn that started the turn within range of an objective.',
    'enemy-unit-of-13-or-more-starting-strength-destroyed-this-turn':
      'For each enemy unit with a Starting Strength of 13 or more destroyed this turn.',
    'beacon-unit-on-battlefield-not-in-own-deployment-zone': 'For each beacon unit on the battlefield outside your deployment zone.',
    'beacon-unit-on-battlefield-not-in-own-territory': 'For each beacon unit on the battlefield outside your territory.',
    'extract-intelligence-action-completed-this-turn': 'For each Extract Intelligence action completed this turn.',
    'friendly-unit-that-committed-sabotage-this-turn': 'For each friendly unit that committed sabotage this turn.',
    'friendly-unit-wholly-within-opponent-deployment-zone': 'For each friendly unit wholly within your opponent’s deployment zone.',
    'objective-guarded-by-your-army': 'For each objective guarded by your army.',
    'operation-marker-within-range-of-a-controlled-central-objective':
      'For each operation marker within range of a central objective you control.',
    'sabotaging-unit-within-range-of-an-objective-in-enemy-territory':
      'For each sabotaging unit within range of an objective in enemy territory.',
    'terrain-area-trapped-this-turn': 'For each terrain area trapped this turn.',
    'terrain-area-trapped-this-turn-that-is-an-objective': 'For each terrain area trapped this turn that contains an objective.',
  }
  const perText = award.per ? per[award.per] : null
  const requirement = award.when ? requirementLabel(award.when, award.parameters ?? {}) : null
  if (perText && requirement) return `${perText} ${requirement}`
  return perText ?? requirement ?? 'Meet this mission’s scoring condition.'
}

function requirementLabel(type: string, parameters: Record<string, unknown>) {
  const minimum = typeof parameters.count_min === 'number' ? parameters.count_min : 1
  const maximum = typeof parameters.count_max === 'number' ? parameters.count_max : null
  const count = quantity(minimum, maximum)
  const tag = typeof parameters.tag === 'string' ? title(parameters.tag) : 'marked'
  switch (type) {
    case 'objective-majority':
      return 'You control more objectives than your opponent.'
    case 'controls-objective': {
      if (parameters.objective === 'your-home') return 'You control your home objective.'
      if (parameters.objective === 'opponent-home') return 'You control your opponent’s home objective.'
      if (parameters.objective === 'tempting-target') return 'You control the Tempting Target objective.'
      if (parameters.objective_role === 'central') return 'You control the central objective.'
      if (parameters.scope === 'no-mans-land') return `You control ${count} in No Man’s Land.`
      if (parameters.exclude === 'home') return 'You control one or more objectives other than your home objective.'
      return `You control ${count}.`
    }
    case 'units-destroyed':
      return `${countSentence(minimum, 'enemy unit was', 'enemy units were')} destroyed this turn.`
    case 'units-destroyed-comparison':
      return 'You destroyed more enemy units this turn than your opponent destroyed in their previous turn.'
    case 'destroyed-while-on-objective':
      return parameters.destroyer_on_objective
        ? 'One or more enemy units were destroyed by a unit within range of an objective.'
        : 'One or more enemy units that started the turn within range of an objective were destroyed.'
    case 'new-objective-controlled':
      return 'You control one or more objectives that you did not control at the start of the turn.'
    case 'objective-has-tag':
      return `${count.charAt(0).toUpperCase()}${count.slice(1)} ${maximum === minimum && minimum === 1 ? 'is' : 'are'} ${tag}.`
    case 'unit-has-tag':
      return `${countSentence(minimum, `enemy unit is ${tag}`, `enemy units are ${tag}`)}.`
    case 'destroyed-in-tagged-terrain':
      return 'One or more enemy units that started the turn in the marked terrain area were destroyed.'
    case 'action-completed':
      return `The ${title(typeof parameters.action_id === 'string' ? parameters.action_id : 'mission')} action was completed this turn.`
    case 'operation-markers': {
      if (parameters.count_max === 0) return 'Your opponent has no active operation markers.'
      return `${countSentence(minimum, 'required operation marker is active', 'required operation markers are active')}.`
    }
    case 'engagement-fronts':
      return `You have units in ${minimum} different table quarters.`
    case 'territory-control':
      return parameters.territory_ref === 'your-deployment-zone'
        ? 'There are no enemy units in your deployment zone.'
        : 'There are no enemy units in your territory.'
    default:
      return `Complete the ${title(type)} condition.`
  }
}

const countSentence = (count: number, _singular: string, plural: string) => `${count === 1 ? 'One or more' : `At least ${count}`} ${plural}`

function quantity(minimum: number, maximum: number | null) {
  if (maximum === minimum) return `exactly ${minimum} ${minimum === 1 ? 'objective' : 'objectives'}`
  if (maximum !== null) return `${minimum}–${maximum} objectives`
  return minimum === 1 ? 'one or more objectives' : `at least ${minimum} objectives`
}

function roundLabel(min: number | null, max: number | null) {
  if (min === null && max === null) return 'Any battle round'
  if (min === null && max === 2) return 'First & second battle rounds'
  if (min !== null && max !== null && min === max) return `Battle round ${min}`
  if (min !== null && max !== null) return `Battle rounds ${min}–${max}`
  if (min !== null) return `Battle round ${min} onwards`
  return `Through battle round ${max}`
}

const groupKey = (award: Award) =>
  [award.mode, award.trigger.timing, award.trigger.phase, award.trigger.playerTurn, award.trigger.roundMin, award.trigger.roundMax].join(
    '|',
  )
const title = (value: string) => value.replaceAll('-', ' ').replaceAll(/\b\w/g, (letter) => letter.toLocaleUpperCase())
