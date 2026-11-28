import { z } from 'zod'
import { uniqueBy } from '../core/collections'
import type { CombatFacts } from '../core/combatReading'
import type { CombatReading, CombatRuleChoice, CombatRuleEffect, CombatTarget } from '../core/combatRules'
import { combatTextKey, type RuleQuestion } from '../core/combatRuleCompiler'
import type { ReminderTiming } from '../core/reminders'
import type { PickedGrant, TextFacts, WrittenAbilityGrant } from '../core/textFacts'
import { titleCaseAbility } from './catalogueAbilityGrants'

/**
 * VS Data's typed effect blocks (`vs-data-facts` version 1, VS Data's `docs/rule-facts.md`), read into the facts
 * Praetorium's rules read of a text. Each schema is closed as VS Data's is, so a field Praetorium does not know fails the
 * block rather than being dropped. A few fields it knows have no place in `TextFacts` yet and are left out: a grant's
 * further condition and recipients, a target limited to Attached units, and a weapon ability for the bearer's weapons
 * alone.
 */
const keyword = z.string().min(1)
const selectors = z.array(keyword).min(1)
const attacksSchema = z.array(z.enum(['ranged', 'melee'])).min(1)
const unresolvedSchema = z.strictObject({ unresolved: z.string() })

const diceSchema = z.strictObject({ dice: z.int().min(0), sides: z.union([z.literal(3), z.literal(6)]), bonus: z.int().min(0) })
const changeSchema = z.union([z.int(), diceSchema.extend({ dice: z.int().min(1) })])
const effectSchema = z.strictObject({
  role: z.enum(['attacker', 'defender']),
  attacks: attacksSchema,
  weaponAbility: keyword.optional(),
  weaponHas: keyword.optional(),
  weaponLacks: keyword.optional(),
  lostWeaponAbility: keyword.optional(),
  weapon: z.string().min(1).optional(),
  characteristic: z
    .strictObject({
      name: z.enum(['range', 'attacks', 'ballistic-skill', 'weapon-skill', 'strength', 'armour-penetration', 'damage']),
      add: changeSchema.optional(),
      set: changeSchema.optional(),
      multiply: z.int().min(2).optional(),
      nonCumulative: z.literal(true).optional(),
    })
    .optional(),
  targetKeywords: selectors.optional(),
  excludedTargetKeywords: selectors.optional(),
  modelKeywords: selectors.optional(),
  excludedModelKeywords: selectors.optional(),
  condition: z.enum(['stronger', 'not-stronger', 'double-strength', 'critical-wound']).optional(),
  ignoreHitModifiers: z.literal(true).optional(),
  ignoreWoundModifiers: z.literal(true).optional(),
  ignoreSkillModifiers: z.literal(true).optional(),
  criticalHit: z.int().min(2).max(6).optional(),
  criticalHitRequiresSuccess: z.literal(true).optional(),
  criticalWound: z.int().min(2).max(6).optional(),
  criticalWoundRequiresSuccess: z.literal(true).optional(),
  allHitsCritical: z.literal(true).optional(),
  unmodifiedSix: z.enum(['hit', 'wound']).optional(),
  invulnerable: z.int().min(2).max(6).optional(),
  save: z.int().min(2).max(6).optional(),
  improveSave: z.strictObject({ by: z.int().min(1), best: z.int().min(2).max(6) }).optional(),
  toughness: z.int().optional(),
  targetToughness: z.int().optional(),
  targetSaveModifier: z.int().optional(),
  damageDivisor: z.int().min(2).optional(),
  rolls: z
    .strictObject({
      hitModifier: z.int().optional(),
      woundModifier: z.int().optional(),
      hitReroll: z.enum(['ones', 'failed']).optional(),
      woundReroll: z.enum(['ones', 'failed']).optional(),
      cover: z.boolean().optional(),
      singleRerolls: z
        .array(z.enum(['hit', 'wound', 'damage', 'save']))
        .min(1)
        .optional(),
      saveReroll: z.enum(['ones', 'failed']).optional(),
    })
    .optional(),
  feelNoPain: z.int().min(2).max(6).optional(),
  psychicFeelNoPain: z.int().min(2).max(6).optional(),
  mortalFeelNoPain: z.int().min(2).max(6).optional(),
  mortalWounds: z
    .strictObject({
      timing: z.enum(['before', 'after', 'outside-attacks']),
      rolls: z.int().min(1),
      psychic: z.boolean().optional(),
      perModel: z.literal(true).optional(),
      perToughness: z.literal(true).optional(),
      sacrifice: z.int().min(1).optional(),
      outcomes: z.array(z.strictObject({ min: z.int().min(1).max(6), max: z.int().min(1).max(6), damage: diceSchema })).min(1),
      max: z.int().min(1).optional(),
    })
    .optional(),
  damageReroll: z.enum(['ones', 'any']).optional(),
  damageReduction: z.int().min(1).optional(),
  unitStat: z
    .strictObject({
      kind: z.enum(['movement', 'toughness', 'wounds', 'leadership', 'objective-control']),
      add: z.int().optional(),
      set: z.int().optional(),
    })
    .optional(),
  ability: z.string().min(1).optional(),
  activates: z.array(z.string().min(1)).min(1).optional(),
  bearerOnly: z.literal(true).optional(),
  wounds: z.int().optional(),
  regainWounds: z.union([z.int().min(1), diceSchema]).optional(),
})
type VsDataEffect = z.infer<typeof effectSchema>

const inches = z.int().min(1)
const conditionSchema = z.union([
  z.strictObject({
    kind: z.enum([
      'option',
      'leading',
      'selected-target',
      'activated',
      'selected-visible-attacker',
      'set-up-as-reinforcements',
      'charged',
      'remained-stationary',
      'target-in-engagement-range',
      'selected-target-in-engagement-range',
      'target-closest',
      'target-on-objective',
      'source-destroyed-unit',
      'target-below-starting-strength',
      'target-below-half-strength',
      'target-battle-shocked',
      'target-tougher',
      'on-objective',
    ]),
  }),
  z.strictObject({
    kind: z.enum(['within', 'attacker-within', 'selected-unit-within', 'selected-target-within', 'objective-within', 'target-within']),
    inches,
  }),
  z.strictObject({ kind: z.literal('wounds-remaining'), min: z.int().min(1), max: z.int().min(1) }),
  z.strictObject({ kind: z.literal('roll'), attacks: z.enum(['ranged', 'melee']), roll: z.enum(['hit', 'wound']) }),
  z.strictObject({ kind: z.literal('activated-at-start'), turn: z.enum(['own', 'opponent', 'any']) }),
  z.strictObject({ kind: z.enum(['for-models', 'for-units']), keywords: selectors, excludedKeywords: selectors.optional() }),
  z.strictObject({ kind: z.literal('stated'), label: z.string().min(1).optional() }),
  z.strictObject({ kind: z.enum(['enemy-status', 'own-status']), status: keyword }),
])
type VsDataCondition = z.infer<typeof conditionSchema>

const choiceSchema = z.strictObject({
  option: z.string().min(1).optional(),
  armyWide: z.literal(true).optional(),
  selected: keyword.optional(),
  conditions: z.array(conditionSchema),
  effects: z.array(effectSchema),
})
const choicesSchema = z.strictObject({ choices: z.array(choiceSchema), default: z.int().min(0) })
const readingSchema = z.strictObject({
  choices: z.array(choiceSchema).optional(),
  default: z.int().min(0).optional(),
  shown: choicesSchema.nullable().optional(),
  fallback: choicesSchema.optional(),
  roles: z
    .array(z.enum(['attacker', 'defender']))
    .min(1)
    .optional(),
})
const unitTargetSchema = z.strictObject({
  anyOf: z.array(selectors).min(1).optional(),
  excluded: selectors.optional(),
  none: z.literal(true).optional(),
  attached: z.literal(true).optional(),
})
const questionSchema = z.union([
  z.strictObject({ unitHas: keyword }),
  z.strictObject({ everyModelHas: keyword }),
  z.strictObject({ keyword }),
  z.strictObject({ psychic: z.literal(true) }),
])
const treeNodeSchema = z.union([
  z.strictObject({ reading: z.int().min(0) }),
  z.strictObject({ ask: questionSchema, yes: z.int().min(0), no: z.int().min(0) }),
])
const combatSchema = z.strictObject({
  applies: z
    .strictObject({
      target: unitTargetSchema.optional(),
      leading: z.literal(true).optional(),
      reachesAttached: z.literal(true).optional(),
      selectsOther: z.literal(true).optional(),
      recipient: z.strictObject({ target: unitTargetSchema.optional() }).optional(),
      orders: z.strictObject({ target: unitTargetSchema.optional() }).optional(),
    })
    .optional(),
  readings: z.array(readingSchema).min(1),
  trees: z.array(z.array(treeNodeSchema).min(1)).min(1),
  contexts: z.record(
    z.string().regex(/^(own|leading|aura|army|stratagem-(shooting|fight|both))\.(one|many)\.(known|unknown)$/),
    z.int().min(0),
  ),
})

const grantSchema = z.strictObject({
  ability: z.string().min(1),
  to: z.enum(['bearer', 'leader', 'unit', 'models']),
  models: keyword.optional(),
  named: z.literal(true).optional(),
  whileAttached: z.literal(true).optional(),
  counterpart: z.array(keyword).optional(),
  linked: z.literal(true).optional(),
  against: z
    .array(z.enum(['psychic-attacks', 'mortal-wounds']))
    .min(1)
    .optional(),
  recipientKeywords: selectors.optional(),
  /** Only the units the player picks as the battle begins gain it, up to `count`, within `withinInches` of the bearer. */
  picked: z
    .strictObject({ count: z.int().min(1).optional(), withinInches: z.int().min(1).optional(), limited: z.literal(true).optional() })
    .optional(),
  conditional: z.literal(true).optional(),
})
const keywordGrantSchema = z.strictObject({
  keyword,
  to: z.enum(['bearer', 'leader', 'unit']),
  whileAttached: z.literal(true).optional(),
  counterpart: z.array(keyword).optional(),
  recipientKeywords: selectors.optional(),
  /** Only the units the player picks as the battle begins gain it, up to `count`, within `withinInches` of the bearer. */
  picked: z
    .strictObject({ count: z.int().min(1).optional(), withinInches: z.int().min(1).optional(), limited: z.literal(true).optional() })
    .optional(),
  conditional: z.literal(true).optional(),
})
const grantsSchema = z.strictObject({
  abilities: z.array(grantSchema).optional(),
  keywords: z.array(keywordGrantSchema).optional(),
  normalized: z
    .strictObject({ abilities: z.array(grantSchema) })
    .nullable()
    .optional(),
})
const weaponAbilitiesSchema = z
  .array(
    z.strictObject({
      ability: keyword,
      attacks: attacksSchema,
      to: z.enum(['army', 'own-unit', 'led-unit', 'bearer']),
      keywords: selectors.optional(),
      excludedKeywords: selectors.optional(),
    }),
  )
  .min(1)
const reminderSchema = z.strictObject({
  timings: z.array(
    z.strictObject({
      at: z.enum(['phase-start', 'phase-end', 'turn-start', 'turn-end', 'round-start', 'round-end']),
      phase: z.enum(['command', 'movement', 'shooting', 'charge', 'fight', 'any']).optional(),
      turn: z.enum(['own', 'opponent', 'any']).optional(),
      firstRoundOnly: z.literal(true).optional(),
    }),
  ),
  whileDestroyed: z.literal(true).optional(),
})
const rosterSchema = z.strictObject({
  addsUnits: z
    .array(z.strictObject({ unit: z.string().min(1), trigger: z.enum(['shooting', 'kill']), shared: z.boolean() }))
    .min(1)
    .optional(),
  movement: z
    .array(z.enum(['advance-and-charge', 'surge-after-enemy-shooting']))
    .min(1)
    .optional(),
})
const attachmentSchema = z.strictObject({
  units: z.array(z.string().min(1)).min(1).optional(),
  requiresLeader: z.literal(true).optional(),
  substitutes: z.array(z.string().min(1)).min(1).optional(),
})
const allowanceSchema = z
  .strictObject({
    options: z.string().min(1),
    limit: z.int().min(2).optional(),
    extra: z.int().min(1).optional(),
    also: z.string().min(1).optional(),
    whileLeading: z.literal(true).optional(),
  })
  .refine((allowance) => [allowance.limit, allowance.extra, allowance.also].filter((given) => given !== undefined).length === 1)
const optionsSchema = z.strictObject({
  offered: z.array(z.string().min(1)).min(1).optional(),
  allowances: z.array(allowanceSchema).min(1).optional(),
})
const orUnresolved = <T extends z.ZodType>(schema: T) => z.union([unresolvedSchema, schema])

/**
 * One record's effect blocks as a compacted release keeps them: `references` as the names of the rules it names, which
 * Praetorium finds its rules by.
 */
export const vsDataEffectBlocksSchema = z.object({
  grants: orUnresolved(grantsSchema).optional(),
  weaponAbilities: orUnresolved(weaponAbilitiesSchema).optional(),
  reserves: orUnresolved(z.strictObject({ exempt: z.literal(true).optional(), exemptUnits: selectors.optional() })).optional(),
  invulnerableSave: orUnresolved(
    z.strictObject({
      roll: z.int().min(2).max(6),
      conditional: z.literal(true).optional(),
      keywords: selectors.optional(),
      against: z.enum(['ranged', 'melee']).optional(),
    }),
  ).optional(),
  upgradesWeapon: orUnresolved(z.literal(true)).optional(),
  reminder: orUnresolved(reminderSchema).optional(),
  roster: orUnresolved(rosterSchema).optional(),
  attachment: orUnresolved(attachmentSchema).optional(),
  options: orUnresolved(optionsSchema).optional(),
  references: z.array(z.string().min(1)).optional(),
  combat: orUnresolved(combatSchema).optional(),
})
export type VsDataEffectBlocks = z.infer<typeof vsDataEffectBlocksSchema>

/**
 * A rules version's effect blocks as materializing keeps them, beside its summaries and read apart from them, by `kind:id`:
 * checked when kept, each block Praetorium cannot read held back as unresolved, so reading them back parses nothing.
 */
export type VsDataEffectsFile = {
  release: string
  rulesVersion: { edition: string; update: string }
  effects: Record<string, Record<string, unknown>>
}

/** Where a compacted release keeps its effect blocks: beside its summaries file. */
export const vsDataEffectsPath = (summaries: string) => summaries.replace(/\.json$/, '.effects.json')

/** The blocks a record publishes, with `detail` and the Enhancement and Stratagem facts Praetorium reads elsewhere left out. */
export const EFFECT_BLOCKS = [
  'grants',
  'weaponAbilities',
  'reserves',
  'invulnerableSave',
  'upgradesWeapon',
  'reminder',
  'roster',
  'attachment',
  'options',
  'references',
  'combat',
] as const satisfies readonly (keyof VsDataEffectBlocks)[]

const ROLLED = new Set(['attacks', 'damage'])

/**
 * Whether an effect changes something the simulator cannot apply: a save re-roll for some models alone (the engine
 * re-rolls a whole unit's saves), dice or multiplying for a characteristic other than Attacks and Damage, or Toughness or
 * Wounds changed through a unit characteristic rather than their own fields. Its reading is not calculated rather than
 * calculated without that part.
 */
function unappliable({ characteristic, unitStat, rolls, ...effect }: VsDataEffect) {
  return (
    Boolean(rolls?.saveReroll && (effect.modelKeywords || effect.excludedModelKeywords || effect.bearerOnly)) ||
    (characteristic !== undefined &&
      !ROLLED.has(characteristic.name) &&
      (characteristic.multiply !== undefined || typeof characteristic.add === 'object' || typeof characteristic.set === 'object')) ||
    (unitStat?.add !== undefined && (unitStat.kind === 'toughness' || unitStat.kind === 'wounds'))
  )
}
/** Wounds a model regains and mortal wounds outside the attacks, which `effectOf` leaves out as the simulator models neither. */
const unmodelled = ({ regainWounds, mortalWounds }: VsDataEffect) =>
  regainWounds !== undefined || mortalWounds?.timing === 'outside-attacks'
/** The fields of an applied effect that say only where or when it applies. */
const SELECTORS = new Set([
  'role',
  'phases',
  'bearerOnly',
  'weapon',
  'targetKeywords',
  'excludedTargetKeywords',
  'modelKeywords',
  'excludedModelKeywords',
  'condition',
])
const changes = (effect: VsDataEffect) => Object.keys(effectOf(effect) ?? {}).some((field) => !SELECTORS.has(field))
/** Whether the simulator calculates a reading: one that does nothing but what it leaves out is not calculated. */
const appliable = (choices: readonly z.infer<typeof choiceSchema>[]) =>
  !choices.some((choice) => choice.effects.some(unappliable)) &&
  !(choices.some((choice) => choice.effects.some(unmodelled)) && !choices.some((choice) => choice.effects.some(changes)))

const TURN: Record<'own' | 'opponent' | 'any', ReminderTiming['turn']> = { own: 'your-turn', opponent: 'opponent-turn', any: 'either' }
const PROFILE = { ranged: 'Ranged Weapons', melee: 'Melee Weapons' } as const
const MOVEMENT = {
  'advance-and-charge': 'Advance and charge',
  'surge-after-enemy-shooting': 'Up to D6″ surge after enemy shooting destroys a model',
}
const USE: Record<string, string> = { own: 'unit', leading: 'attached', aura: 'nearby', army: 'detachment' }
const STRATAGEM_PHASES: Record<string, string> = { shooting: 'ranged', fight: 'melee', both: 'ranged+melee' }

/** A placement as Praetorium keys a recorded reading (`placementKey` in `combatReading.ts`), from VS Data's context. */
function placementOf(context: string) {
  const [use, models, keywords] = context.split('.') as [string, string, string]
  const phases = use.startsWith('stratagem-') ? STRATAGEM_PHASES[use.slice('stratagem-'.length)] : undefined
  return `${phases ? 'stratagem' : USE[use]}:${models === 'one' ? 1 : 0}:${keywords === 'known' ? 1 : 0}${phases ? `:${phases}` : ''}`
}

const lower = (text: string) => text.toLocaleLowerCase('en-GB')

/** A question keyed as the rule's own keywords are (`ruleAnswers`), so either apostrophe and a faction prefix match. */
function questionOf(question: z.infer<typeof questionSchema>): RuleQuestion {
  if ('psychic' in question) return 'psychic'
  if ('unitHas' in question) return `covers:${combatTextKey(question.unitHas)}`
  if ('everyModelHas' in question) return `every:${combatTextKey(question.everyModelHas)}`
  return `is:${combatTextKey(question.keyword)}`
}

/** Stands for the rule's source in a label, as `combatReading.ts` records it. */
const SOURCE = '\u0000source\u0000'
const TURN_NAME = { any: 'any turn', own: 'your turn', opponent: "your opponent's turn" }

/** A condition as the label a player picks the choice by, in the words Praetorium's reader gives it. */
function conditionLabel(condition: VsDataCondition): string {
  switch (condition.kind) {
    case 'leading':
      return 'While leading a unit'
    case 'selected-target':
      return 'Against the selected target'
    case 'activated':
      return 'Ability activated'
    case 'selected-visible-attacker':
      return 'Selected visible attacker'
    case 'set-up-as-reinforcements':
      return 'Set up as Reinforcements'
    case 'charged':
      return 'Charged this turn'
    case 'remained-stationary':
      return 'Remained stationary'
    case 'target-in-engagement-range':
      return 'Target in Engagement Range'
    case 'selected-target-in-engagement-range':
      return 'Selected target within Engagement Range'
    case 'target-closest':
      return 'Target is the closest eligible target'
    case 'target-on-objective':
      return 'Target within range of an objective marker'
    case 'source-destroyed-unit':
      return `After ${SOURCE} destroys a unit`
    case 'target-below-starting-strength':
      return 'Target is below its Starting Strength'
    case 'target-below-half-strength':
      return 'Target is Below Half-strength'
    case 'target-battle-shocked':
      return 'Target is Battle-shocked'
    case 'target-tougher':
      return 'Target T exceeds attack S'
    case 'on-objective':
      return 'On an objective'
    case 'within':
      return `Within ${condition.inches}"`
    case 'attacker-within':
      return `Attacker within ${condition.inches}"`
    case 'selected-unit-within':
      return `Selected unit within ${condition.inches}"`
    case 'selected-target-within':
      return `Selected target within ${condition.inches}"`
    case 'objective-within':
      return `Selected objective within ${condition.inches}" of source`
    case 'target-within':
      return `Target within ${condition.inches}"`
    case 'wounds-remaining':
      return `${condition.min}–${condition.max} wounds remaining`
    case 'roll':
      return `${condition.attacks === 'ranged' ? 'Shooting' : 'Melee'} ${condition.roll} roll`
    case 'activated-at-start':
      return `Activated at the start of ${TURN_NAME[condition.turn]}`
    case 'for-models':
      return `For ${condition.keywords.join(', ')} models`
    case 'for-units':
      return `For ${condition.keywords.join(', ')}`
    case 'stated':
      return condition.label ?? 'Condition the rule states'
    case 'enemy-status':
      return `Opponent ${condition.status.toLowerCase()}`
    case 'own-status':
      return `This unit is ${condition.status.toLowerCase()}`
    case 'option':
      return ''
  }
}

/**
 * An effect as Praetorium applies it, from a reading `unappliable` passes; an effect left with nothing Praetorium applies
 * is none. A single re-roll is the attacker's of a hit, wound or damage roll, or the defender's of a save.
 */
function effectOf(effect: VsDataEffect): CombatRuleEffect | null {
  const {
    attacks,
    weaponAbility,
    weaponHas,
    weaponLacks,
    lostWeaponAbility,
    rolls,
    characteristic,
    mortalWounds: mortals,
    regainWounds: _regainWounds,
    ...applied
  } = effect
  const mortalWounds = mortals?.timing === 'outside-attacks' ? undefined : mortals
  const { role, bearerOnly: _bearerOnly, ...given } = applied
  const { saveReroll, singleRerolls, ...otherRolls } = rolls ?? {}
  const ownRerolls = singleRerolls?.filter((kind) => (kind === 'save') === (role === 'defender'))
  const options = { ...otherRolls, ...(ownRerolls?.length ? { singleRerolls: ownRerolls } : {}) }
  if (
    !Object.keys(given).length &&
    !weaponAbility &&
    !lostWeaponAbility &&
    !saveReroll &&
    !Object.keys(options).length &&
    !characteristic &&
    !mortalWounds
  )
    return null
  return {
    ...applied,
    phases: attacks,
    ...(weaponAbility ? { keyword: titleCaseAbility(weaponAbility) } : {}),
    ...(lostWeaponAbility ? { lostKeyword: titleCaseAbility(lostWeaponAbility) } : {}),
    ...(weaponHas ? { requiresWeaponKeyword: titleCaseAbility(weaponHas) } : {}),
    ...(weaponLacks ? { lacksWeaponKeyword: titleCaseAbility(weaponLacks) } : {}),
    ...(Object.keys(options).length ? { options } : {}),
    ...(saveReroll ? { saveReroll } : {}),
    ...(characteristic ? { characteristic: (({ name, ...change }) => ({ kind: name, ...change }))(characteristic) } : {}),
    ...(mortalWounds
      ? {
          mortalWounds: (({ max, timing, ...wounds }) => ({
            ...wounds,
            timing: timing as 'before' | 'after',
            ...(max ? { limit: max } : {}),
          }))(mortalWounds),
        }
      : {}),
  }
}

function choiceOf(choice: z.infer<typeof choiceSchema>): CombatRuleChoice {
  const label = choice.conditions.map((condition) => (condition.kind === 'option' ? choice.option! : conditionLabel(condition))).join(' · ')
  return {
    label: label || 'Active',
    effects: choice.effects.flatMap((effect) => effectOf(effect) ?? []),
    ...(choice.option ? { option: choice.option } : {}),
    ...(choice.armyWide ? { armyWide: true } : {}),
    ...(choice.selected ? { selected: choice.selected } : {}),
  }
}

/**
 * The choice a placement starts on in Praetorium, which VS Data's `default` does not say, as one reading serves several
 * placements: the state an option names, where the rule starts a unit in one; else, for a unit's own ability, its leader's
 * or a Detachment rule, the first choice where it holds unconditionally; else none, as another unit's aura or a Stratagem
 * is off until the player turns it on.
 */
function startingChoice(reading: { choices: z.infer<typeof choiceSchema>[]; default: number }, applies: boolean) {
  const given = reading.choices[reading.default - 1]
  if (given?.conditions.some((condition) => condition.kind === 'option')) return reading.default
  const first = reading.choices[0]
  return applies && first && !first.conditions.length && first.effects.some((effect) => effectOf(effect)) ? 1 : 0
}

const compiledOf = (reading: { choices: z.infer<typeof choiceSchema>[]; default: number }, applies: boolean) => ({
  choices: reading.choices.map(choiceOf),
  defaultChoice: startingChoice(reading, applies),
})

const NONE = '\u0000none'
function targetOf(target: z.infer<typeof unitTargetSchema> | undefined): CombatTarget | null {
  if (!target) return null
  if (target.none) return { allowed: [[NONE]], excluded: [] }
  return { allowed: (target.anyOf ?? []).map((keywords) => keywords.map(lower)), excluded: (target.excluded ?? []).map(lower) }
}

/**
 * A rule VS Data holds back the reading of, in every placement: it takes part in combat, but nothing it does is calculated,
 * so the simulator says so rather than leaving it out.
 */
const UNREAD: CombatFacts = {
  judging: { target: null },
  readings: Object.fromEntries(
    ['unit', 'attached', 'nearby', 'detachment', 'stratagem'].flatMap((scope) =>
      (scope === 'stratagem' ? [':ranged', ':melee', ':ranged+melee'] : ['']).flatMap((phases) =>
        ['1:1', '1:0', '0:1', '0:0'].map((models) => [`${scope}:${models}${phases}`, [0]]),
      ),
    ),
  ),
  leaves: [{ compiled: null, legacy: [], legacyDefault: 0, roles: ['attacker', 'defender'] }],
}

const uncalculated = (reading: CombatReading) => !reading.compiled && !reading.legacy.length && !reading.roles.length && !reading.shown

/**
 * VS Data's combat facts, with the roles the words take wherever VS Data keeps no block or reads no choices for a rule:
 * VS Data has such a rule reported as not calculated, which the simulator does only for a rule with roles. Nothing the
 * rule does is read from the words.
 */
export function combatOfVsDataOrWords(facts: CombatFacts | null | undefined, roles: () => CombatReading['roles']): CombatFacts | null {
  if (facts && !facts.leaves.some(uncalculated)) return facts
  const read = roles()
  if (!read.length) return facts ?? null
  const unread: CombatReading = { compiled: null, legacy: [], legacyDefault: 0, roles: read }
  if (!facts) return { ...UNREAD, leaves: [unread] }
  return { ...facts, leaves: facts.leaves.map((leaf) => (uncalculated(leaf) ? unread : leaf)) }
}

/** Placements where a rule applies unless a condition says otherwise: its own unit's, its leader's and a Detachment's. */
const APPLIES = new Set(['unit', 'attached', 'detachment'])

function combatOf(combat: z.infer<typeof combatSchema>): CombatFacts {
  const leaves: CombatReading[] = []
  const leafAt = new Map<string, number>()
  const leaf = (at: number, applies: boolean) => {
    const key = `${at}:${applies}`
    let found = leafAt.get(key)
    if (found === undefined) {
      const reading = combat.readings[at]!
      found =
        leaves.push({
          compiled:
            reading.choices && appliable(reading.choices)
              ? compiledOf({ choices: reading.choices, default: reading.default ?? 0 }, applies)
              : null,
          ...(reading.shown !== undefined && (!reading.shown || appliable(reading.shown.choices))
            ? { shown: reading.shown && compiledOf(reading.shown, applies) }
            : {}),
          legacy: reading.fallback && appliable(reading.fallback.choices) ? reading.fallback.choices.map(choiceOf) : [],
          legacyDefault: reading.fallback?.default ?? 0,
          roles: reading.roles ?? [],
        }) - 1
      leafAt.set(key, found)
    }
    return found
  }
  const readings: CombatFacts['readings'] = {}
  for (const [context, at] of Object.entries(combat.contexts)) {
    const placement = placementOf(context)
    const applies = APPLIES.has(placement.split(':')[0]!)
    readings[placement] = combat.trees[at]!.map((node) =>
      'ask' in node ? [questionOf(node.ask), node.yes, node.no] : leaf(node.reading, applies),
    )
  }
  const applies = combat.applies ?? {}
  return {
    judging: {
      ...(applies.orders ? { orders: { target: targetOf(applies.orders.target) } } : {}),
      ...(applies.selectsOther ? { selectsOther: true } : {}),
      ...(applies.leading ? { leading: true } : {}),
      ...(applies.reachesAttached ? { reachesAttached: true } : {}),
      ...(applies.recipient ? { recipient: true, recipientTarget: targetOf(applies.recipient.target) } : {}),
      target: targetOf(applies.target),
    },
    readings,
    leaves,
  }
}

const AGAINST = { 'psychic-attacks': 'psychic attacks', 'mortal-wounds': 'mortal wounds' }
function grantOf(grant: z.infer<typeof grantSchema>): WrittenAbilityGrant {
  const condition = {
    ...(grant.against ? { condition: `against ${grant.against.map((against) => AGAINST[against]).join(' and ')}` } : {}),
    ...(grant.conditional ? { conditional: true as const } : {}),
  }
  if (grant.to === 'models') return { name: grant.ability, recipient: 'models', models: grant.models!, ...condition }
  return {
    written: grant.ability,
    recipient: grant.to,
    ...(grant.named ? { explicit: true } : {}),
    ...(grant.whileAttached ? { attached: true } : {}),
    ...(grant.counterpart ? { target: grant.counterpart.length ? grant.counterpart.join(' or ') : NONE } : {}),
    ...(grant.linked ? { linked: true } : {}),
    ...condition,
  }
}
/** A keyword a rule gives, shown as an ability of that name. */
const keywordGrantOf = ({ keyword: given, ...grant }: z.infer<typeof keywordGrantSchema>) =>
  grantOf({ ...grant, ability: titleCaseAbility(given) })
/**
 * A grant only to the units the player picks as the battle begins is left out, as is a deployment ability a rule grants
 * only once something happens, as a return from Strategic Reserves: a list's deployment options would read either as
 * always held. A grant on the unit a model attaches to is one Praetorium checks itself.
 */
const DEPLOYMENT = /^(?:deep strike|scouts\b|infiltrators)/i
const held = (grant: {
  ability?: string
  keyword?: string
  picked?: object
  conditional?: true
  counterpart?: readonly string[]
  whileAttached?: true
}) =>
  !grant.picked &&
  (!grant.conditional || Boolean(grant.counterpart || grant.whileAttached) || !DEPLOYMENT.test(grant.ability ?? grant.keyword ?? ''))
const statementOf = (
  abilities: readonly z.infer<typeof grantSchema>[] | null | undefined,
  keywords: readonly z.infer<typeof keywordGrantSchema>[] = [],
) =>
  abilities || keywords.length
    ? {
        matched: true,
        grants: [...(abilities ?? []).filter(held).map(grantOf), ...keywords.filter(held).map(keywordGrantOf)],
      }
    : { matched: false, grants: [] }

/** One block as Praetorium reads it, or undefined where VS Data holds it back as unresolved or it does not read. */
function blockOf<Block extends (typeof EFFECT_BLOCKS)[number]>(blocks: Readonly<Record<string, unknown>>, block: Block) {
  const parsed = vsDataEffectBlocksSchema.shape[block].safeParse(blocks[block])
  const value = parsed.success ? parsed.data : undefined
  return value !== null && typeof value === 'object' && 'unresolved' in value
    ? undefined
    : (value as Exclude<z.infer<(typeof vsDataEffectBlocksSchema.shape)[Block]>, { unresolved: string }> | undefined)
}

/**
 * The facts one VS Data record's effect blocks state, in the shape Praetorium's rules read. A block VS Data holds back as
 * unresolved states nothing, so what it would cover reads as not calculated, as an unread text does.
 */
export function textFactsOfVsData(blocks: Readonly<Record<string, unknown>>): TextFacts {
  const grants = blockOf(blocks, 'grants')
  const weaponAbilities = blockOf(blocks, 'weaponAbilities') ?? []
  const reserves = blockOf(blocks, 'reserves')
  const invulnerableSave = blockOf(blocks, 'invulnerableSave')
  const reminder = blockOf(blocks, 'reminder')
  const roster = blockOf(blocks, 'roster')
  const attachment = blockOf(blocks, 'attachment')
  const options = blockOf(blocks, 'options')
  const combat = blockOf(blocks, 'combat')
  // The ability a rule's own unit always gains by an effect, as Stealth, or the cover one gives it, as "counts as having
  // the Benefit of Cover": a datasheet lists it beside what it changes, as a grant the grants block may leave out.
  const ownTree = combat?.trees[combat.contexts['own.many.known'] ?? -1]
  const ownNode = ownTree?.length === 1 ? ownTree[0] : undefined
  const own = ownNode && 'reading' in ownNode ? combat?.readings[ownNode.reading] : undefined
  // One some models gain is theirs alone, by the one keyword or name they match.
  const shown = uniqueBy(
    (own?.choices?.[0]?.conditions.length ? [] : (own?.choices?.[0]?.effects ?? [])).flatMap((effect) => {
      const ability =
        effect.ability ?? (effect.role === 'defender' && effect.rolls?.cover && !effect.weapon ? 'Benefit of Cover' : undefined)
      if (!ability || effect.excludedModelKeywords || (effect.modelKeywords?.length ?? 1) > 1) return []
      return [
        effect.modelKeywords ? { ability, to: 'models' as const, models: effect.modelKeywords[0]! } : { ability, to: 'unit' as const },
      ]
    }),
    (grant) => JSON.stringify(grant),
  ).filter((shownGrant) => !grants?.abilities?.some((grant) => grant.ability.toLowerCase() === shownGrant.ability.toLowerCase()))
  const unreadCombat = blocks.combat !== undefined && !combat
  const references = blockOf(blocks, 'references')
  const weaponGrants = weaponAbilities.flatMap((grant) =>
    grant.to === 'army'
      ? [
          {
            keyword: titleCaseAbility(grant.ability),
            recipients: grant.keywords!.join(', '),
            ...(grant.excludedKeywords ? { exclusions: grant.excludedKeywords.join(', ') } : {}),
            profileTypes: grant.attacks.map((attacks) => PROFILE[attacks]),
          },
        ]
      : [],
  )
  // A bearer's weapons are among its own unit's, which a datasheet shows them with.
  const weaponGrantTo = (to: 'own-unit' | 'led-unit') => {
    const grant = weaponAbilities.find((candidate) => candidate.to === to || (to === 'own-unit' && candidate.to === 'bearer'))
    return grant && { keyword: titleCaseAbility(grant.ability), profileTypes: grant.attacks.map((attacks) => PROFILE[attacks]) }
  }
  const picked: PickedGrant[] = [
    ...(grants?.abilities ?? []).map((grant) => ({ ...grant, given: grant.ability })),
    ...(grants?.keywords ?? []).map((grant) => ({ ...grant, given: titleCaseAbility(grant.keyword) })),
  ].flatMap(({ given, to, picked: pick, recipientKeywords }) =>
    pick && to === 'unit' ? [{ ability: given, recipients: recipientKeywords ?? [], ...pick }] : [],
  )
  const ownWeaponGrant = weaponGrantTo('own-unit')
  const ledWeaponGrant = weaponGrantTo('led-unit')
  return {
    ...(grants?.abilities || grants?.keywords || shown.length
      ? { abilityGrants: statementOf([...(grants?.abilities ?? []), ...shown], grants?.keywords) }
      : {}),
    ...(grants && grants.normalized !== undefined ? { normalizedAbilityGrants: statementOf(grants.normalized?.abilities) } : {}),
    ...(picked.length ? { pickedGrants: picked } : {}),
    ...(weaponGrants.length ? { weaponGrants } : {}),
    ...(ownWeaponGrant ? { ownWeaponGrant } : {}),
    ...(ledWeaponGrant ? { ledWeaponGrant } : {}),
    ...(reserves?.exemptUnits ? { reserveSelectors: reserves.exemptUnits } : {}),
    ...(reserves?.exempt ? { reserveExemption: true } : {}),
    // A datasheet shows a save the unit always has; a conditional or some models' save is left to the simulator's reading.
    ...(invulnerableSave && !invulnerableSave.conditional && !invulnerableSave.keywords && !invulnerableSave.against
      ? { invulnerableSave: `${invulnerableSave.roll}+` }
      : {}),
    ...(blockOf(blocks, 'upgradesWeapon') ? { linkedWeapon: true } : {}),
    ...(reminder
      ? {
          reminder: {
            timings: reminder.timings.map(
              (timing) =>
                ({
                  moment: timing.at,
                  phase: timing.phase ?? null,
                  turn: timing.turn ? TURN[timing.turn] : 'either',
                  ...(timing.firstRoundOnly ? { firstRoundOnly: true } : {}),
                }) as ReminderTiming,
            ),
            ...(reminder.whileDestroyed ? { whileDestroyed: true } : {}),
          },
        }
      : {}),
    // VS Data writes weapon abilities and the units a rule adds in capitals, as selectors; Praetorium names them as printed.
    ...(roster?.addsUnits ? { unitGeneration: roster.addsUnits.map((added) => ({ ...added, unit: titleCaseAbility(added.unit) })) } : {}),
    ...(roster?.movement ? { movementTools: roster.movement.map((movement) => MOVEMENT[movement]) } : {}),
    ...(attachment?.units
      ? { attachment: { names: attachment.units, ...(attachment.requiresLeader ? { requiresLeader: true } : {}) } }
      : {}),
    ...(attachment?.substitutes ? { substitutes: attachment.substitutes } : {}),
    ...(options?.offered ? { offeredOptions: options.offered } : {}),
    ...(options?.allowances
      ? {
          battleChoiceAllowances: options.allowances.map(({ whileLeading, limit, extra, also, ...allowance }) => ({
            ...allowance,
            ...(limit !== undefined ? { limit } : extra !== undefined ? { extra } : { also: also! }),
            ...(whileLeading ? { leading: true as const } : {}),
          })),
        }
      : {}),
    ...(references ? { references } : {}),
    combat: combat ? combatOf(combat) : unreadCombat ? UNREAD : null,
  }
}
