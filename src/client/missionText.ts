/**
 * What a mission card says, in the words a player would check it in.
 *
 * The reference sheet and the prompt that asks whether a card paid out have to say
 * the same thing about the same card, so both read these rather than each writing
 * their own phrasing.
 */
export type MissionAward = {
  vp: number
  per: string | null
  mode: string | null
  when: string | null
  /** The ceiling on a per-something payout, when the card sets one. */
  max: number | null
  parameters: Record<string, unknown>
  /** How the parts of a compound condition combine, when the card states one. */
  operator: string | null
  operands: { type: string; parameters: Record<string, unknown> }[]
  /** Payouts sharing a group are alternatives: the card pays one of them, not both. */
  group: string | null
  cumulative: boolean
  trigger: { timing: string | null; phase: string | null; playerTurn: string | null; roundMin: number | null; roundMax: number | null }
}

/**
 * How many times a per-something payout is worth taking, or null when nothing bounds it.
 *
 * Rounded up, not down: a card paying 2 VP each up to 5 still pays on the third one,
 * it just stops at 5. Counting to two would quietly cost a point.
 */
export function awardLimit(award: Pick<MissionAward, 'vp' | 'max'>): number | null {
  if (award.max === null || award.vp <= 0) return null
  return Math.max(1, Math.ceil(award.max / award.vp))
}

/** What taking a payout that many times actually pays, never past the card's ceiling. */
export function awardTotal(award: Pick<MissionAward, 'vp' | 'max' | 'per'>, times: number): number {
  const raw = award.per ? award.vp * times : award.vp * Math.min(times, 1)
  return award.max === null ? raw : Math.min(raw, award.max)
}

export function timingLabel(trigger: MissionAward['trigger']) {
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

/**
 * What a payout asks for, or null when the source did not say.
 *
 * A card whose payouts carry no structured condition still describes itself in its
 * own text, so nothing is invented here to fill the gap.
 */
export function conditionLabel(award: MissionAward): string | null {
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
  const requirement = award.operands.length
    ? joinConditions(award.operands, award.operator)
    : award.when
      ? requirementLabel(award.when, award.parameters ?? {})
      : null
  if (perText && requirement) return `${perText} ${requirement}`
  return perText ?? requirement ?? null
}

/** A condition the card states in parts, read back as one sentence. */
function joinConditions(operands: MissionAward['operands'], operator: string | null) {
  const parts = operands.map((operand, at) => {
    const part = requirementLabel(operand.type, operand.parameters).replace(/\.$/, '')
    // Only the first clause opens a sentence, so the rest keep their ordinary case.
    return at === 0 ? part : part.charAt(0).toLocaleLowerCase() + part.slice(1)
  })
  if (!parts.length) return null
  return `${parts.join(operator === 'or' ? ', or ' : ', and ')}.`
}

export function requirementLabel(type: string, parameters: Record<string, unknown>) {
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
      if (parameters.objective_role === 'expansion')
        return `You control ${count === 'one or more objectives' ? 'an expansion objective' : count.replace('objective', 'expansion objective')}.`
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

export const countSentence = (count: number, _singular: string, plural: string) =>
  `${count === 1 ? 'One or more' : `At least ${count}`} ${plural}`

export function quantity(minimum: number, maximum: number | null) {
  if (maximum === minimum) return `exactly ${minimum} ${minimum === 1 ? 'objective' : 'objectives'}`
  if (maximum !== null) return `${minimum}–${maximum} objectives`
  return minimum === 1 ? 'one or more objectives' : `at least ${minimum} objectives`
}

export function roundLabel(min: number | null, max: number | null) {
  if (min === null && max === null) return 'Any battle round'
  if (min === null && max === 2) return 'First & second battle rounds'
  if (min !== null && max !== null && min === max) return `Battle round ${min}`
  if (min !== null && max !== null) return `Battle rounds ${min}–${max}`
  if (min !== null) return `Battle round ${min} onwards`
  return `Through battle round ${max}`
}

export const groupKey = (award: MissionAward) =>
  [award.mode, award.trigger.timing, award.trigger.phase, award.trigger.playerTurn, award.trigger.roundMin, award.trigger.roundMax].join(
    '|',
  )
export const title = (value: string) => value.replaceAll('-', ' ').replaceAll(/\b\w/g, (letter) => letter.toLocaleUpperCase())
