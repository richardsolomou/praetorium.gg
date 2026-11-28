import { splitWeaponKeywords } from './ruleReference'
import { uniqueBy } from './collections'
import { markedBullets, printedPhrasing, printedRule } from './combatPhrasing'
import type { Datasheet, DatasheetCharacteristicKind } from './datasheet'
import {
  COMBAT_PHASES,
  diceExpression,
  rerollRank,
  type CombatInput,
  type CombatOptions,
  type CombatWeapon,
  type CombatPhase,
} from './combat'
import {
  combatTextKey,
  compileCombatRule,
  isOrdersRule,
  labelledChoice,
  normalizeCombatText,
  ordersRecipient,
  ruleAnswers,
  ruleSection,
} from './combatRuleCompiler'
import { datasheetCharacteristicKind, weaponPhase } from './datasheetStructure'
import { carriedCount, type CombatCarrier } from './combatLoadout'
import { combatKeyword, combatKeywordApplies, combatKeywordKind, combatKeywordPhraseMatches } from './combatKeywords'

export type CombatRule = {
  id: string
  name: string
  source: string
  description: string
  phases?: CombatPhase[]
  scope: 'unit' | 'attached' | 'nearby' | 'stratagem' | 'detachment'
  included?: boolean
  appliedDefences?: DatasheetCharacteristicKind[]
  /** Other names the catalogue credits this rule's projected modifiers to, as a detachment's own name or one of its enhancements. */
  appliedAs?: string[]
  models?: number
  keywords?: readonly string[]
  /** The keywords only some of the unit's models have, which `keywords` also lists. */
  partialKeywords?: readonly string[]
  /** What the rule's words decide for this placement, recorded where a token stands for them. */
  reading?: CombatReading
  /** The ability profile of the wargear whose holders the rule's bearer-only effects reach. */
  heldBy?: string
}
/**
 * What a rule's words decide in combat for one placement: the compiled choices, or the choices
 * and default a rule the compiler cannot read falls back on, and the roles its words take.
 */
export type CombatReading = {
  compiled: { choices: CombatRuleChoice[]; defaultChoice: number } | null
  /** The compiled reading with the weapon abilities that change no roll, recorded where it differs, for a datasheet. */
  shown?: { choices: CombatRuleChoice[]; defaultChoice: number } | null
  legacy: CombatRuleChoice[]
  legacyDefault: number
  roles: CombatRuleEffect['role'][]
}
/** Whether choices name several options a player picks between, which a datasheet keeps track of though they may change no attack. */
export const namesOptions = (choices: readonly CombatRuleChoice[]) => new Set(choices.flatMap((choice) => choice.option ?? [])).size > 1

/** A rule's place in a roster that its words decide whether and how it applies within. */
export type CombatRuleJudge = {
  /** The unit's own datasheet ability, another unit's ability, a stratagem or detachment rule, or its faction's army rule. */
  origin: 'own' | 'support' | 'listed' | 'army'
  /** Whether this unit is led by an attached unit, or, for another unit's ability, whether that unit is attached. */
  attached?: boolean
  keywords: readonly string[]
  /** The keywords of the unit and the units attached to it, which a stratagem's target names. */
  unitKeywords: readonly string[]
  /** The keywords of each unit in the roster that could be a stratagem's source. */
  supportKeywords: readonly (readonly string[])[]
}
export type CombatRuleEffect = {
  role: 'attacker' | 'defender'
  phases: CombatPhase[]
  keyword?: string
  characteristic?: { kind: DatasheetCharacteristicKind; nonCumulative?: boolean } & (
    | { add: number; set?: never }
    | { set: number; add?: never }
  )
  weapon?: string
  requiresWeaponKeyword?: string
  targetKeywords?: string[]
  excludedTargetKeywords?: string[]
  condition?: 'stronger' | 'not-stronger' | 'double-strength' | 'critical-wound'
  ignoreHitModifiers?: boolean
  ignoreWoundModifiers?: boolean
  ignoreSkillModifiers?: boolean
  criticalHit?: number
  criticalHitRequiresSuccess?: boolean
  criticalWound?: number
  criticalWoundRequiresSuccess?: boolean
  allHitsCritical?: boolean
  /** Spends the phase's one change of a failed Hit or Wound roll to an unmodified 6. */
  unmodifiedSix?: 'hit' | 'wound'
  /** Only models matching one of these selectors, keywords or a model's name, make their attacks with the effect, or are defended by it. */
  modelKeywords?: string[]
  /** Models with any of these keywords make their attacks without the effect. */
  excludedModelKeywords?: string[]
  invulnerable?: number
  save?: number
  /** Improves the Save characteristic, never past `best`. */
  improveSave?: { by: number; best: number }
  toughness?: number
  targetToughness?: number
  targetSaveModifier?: number
  damageDivisor?: number
  options?: Partial<Pick<CombatOptions, 'hitModifier' | 'woundModifier' | 'hitReroll' | 'woundReroll' | 'cover' | 'singleRerolls'>>
  feelNoPain?: number
  psychicFeelNoPain?: number
  mortalFeelNoPain?: number
  /**
   * Rolls repeat for each attacking model, or once per point of the attacker's highest Toughness; sacrifice is how many
   * of the attacker's own models the ability destroys before it attacks.
   */
  mortalWounds?: NonNullable<CombatInput['mortalWounds']>[number] & { perModel?: boolean; perToughness?: boolean; sacrifice?: number }
  damageReroll?: 'ones' | 'any'
  damageReduction?: number
  /** A unit characteristic no roll reads, as a Move bonus, which only a datasheet shows. */
  unitStat?: { kind: 'movement' | 'leadership' | 'objective-control'; add: number }
  /** The named ability the effect gives the unit, as Stealth, which a datasheet lists beside what it changes. */
  ability?: string
  /** Options of the unit's other rules this makes active together, as an enhancement that makes two Doctrina Imperatives active. */
  activates?: string[]
  /** The effect is the bearer's alone: the attacks of the unit whose rule it is, or attacks on it, not those of a unit it leads. */
  bearerOnly?: true
}
export type CombatRuleChoice = {
  label: string
  effects: CombatRuleEffect[]
  /** The named option this choice is one of, as a Doctrina Imperative or a Battle Protocol, where it is not only a condition. */
  option?: string
  /** Whether the option picked is one for the whole army, as a Doctrina Imperative is, rather than one for each unit, as an Order is. */
  armyWide?: true
  /** The keyword the units a player selects gain, as Halo Override: only they have an army-wide option picked for it. */
  selected?: string
}
/** `source` names the unit whose ability it is, so a combined estimate can end it when that unit is destroyed (19.04). */
export type ActiveCombatRule = {
  name: string
  source?: string
  appliedAs?: readonly string[]
  heldBy?: string
  effects: CombatRuleEffect[]
}

/** Whether the catalogue already counts this rule in a characteristic, under its own name or one it credits the rule to. */
export const combatRuleProjected = (rule: Pick<ActiveCombatRule, 'name' | 'appliedAs'>, modifiers: readonly string[] | undefined) =>
  Boolean(modifiers?.some((source) => source === rule.name || rule.appliedAs?.includes(source)))

export const combatRuleKey = (rule: CombatRule) => `${rule.source}:${rule.name}`

export function activeCombatRules(rules: readonly CombatRule[], choices: Readonly<Record<string, number>>) {
  const chosen = rules.map((rule) => ({
    rule,
    options: combatRuleChoices(rule),
    at: (choices[combatRuleKey(rule)] ?? combatRuleDefault(rule)) - 1,
  }))
  const together = [
    ...new Set(
      chosen.flatMap(({ options, at }) => options[at]?.effects.flatMap((effect) => effect.activates ?? []) ?? []).map(combatTextKey),
    ),
  ]
  return [
    ...new Map(
      chosen.flatMap(({ rule, options, at }) => {
        const effects = (together.length ? effectsTogether(options, at, together) : undefined) ?? options[at]?.effects
        return effects
          ? [[rule.name, { name: rule.name, source: rule.source, appliedAs: rule.appliedAs, heldBy: rule.heldBy, effects }] as const]
          : []
      }),
    ).values(),
  ]
}

/**
 * Every named option of a rule at once, each under the condition its chosen option states, or undefined where the rule
 * lacks one of them. The round's choice no longer matters once both Doctrina Imperatives are active for a unit.
 */
function effectsTogether(options: readonly CombatRuleChoice[], at: number, names: readonly string[]) {
  const parts = options.map((choice) => {
    const [head, ...condition] = choice.label.split(' · ')
    return { choice, head: combatTextKey(head!), condition: condition.join(' · ') }
  })
  const condition = parts[at] && names.includes(parts[at].head) ? parts[at].condition : ''
  const picked = names.map(
    (name) =>
      parts.find((part) => part.head === name && part.condition === condition) ??
      parts.find((part) => part.head === name && !part.condition),
  )
  return picked.every(Boolean) ? picked.flatMap((part) => part!.choice.effects) : undefined
}

/** A defence another attached member shares that the roster already counts in this unit's characteristics, so no estimate can remove it. */
export const combatRuleHasAppliedSharedDefence = (rule: CombatRule) => rule.scope === 'attached' && Boolean(rule.appliedDefences?.length)

/** Each rule once by source, with the player's choice by rule id or its default, as the matchup applies it. */
export function combatRuleSelections(rules: readonly CombatRule[], selections: Readonly<Record<string, number>>) {
  const all = uniqueBy(rules, combatRuleKey)
  const choices = Object.fromEntries(all.map((rule) => [combatRuleKey(rule), selections[rule.id] ?? combatRuleDefault(rule)]))
  return {
    rules: all,
    choices,
    active: (subset: readonly CombatRule[]) => activeCombatRules(subset, choices),
    appliedDefenceSources: (subset: readonly CombatRule[]) => subset.filter(combatRuleHasAppliedSharedDefence).map((rule) => rule.source),
  }
}

/**
 * How each rule with a "1-6 wounds remaining" choice starts for a unit whose health a battle records. Only a lone model
 * has one wounds count to read, so a squad keeps the rule's default.
 */
export function combatDamageStateSelections(
  rules: readonly CombatRule[],
  { models, damage, wounds }: { models: number; damage: number; wounds?: number },
): Record<string, number> {
  if (!wounds || models !== 1) return {}
  const left = wounds - damage
  return Object.fromEntries(
    rules.flatMap((rule) => {
      const states = combatRuleChoices(rule).flatMap(({ label }, index) => {
        const range = /^(?:This model has )?(\d+)[-–](\d+) wounds remaining$/.exec(label)
        return range ? [{ selection: index + 1, min: Number(range[1]), max: Number(range[2]) }] : []
      })
      return states.length ? [[rule.id, states.find(({ min, max }) => left >= min && left <= max)?.selection ?? 0]] : []
    }),
  )
}

const weaponKey = (value: string) => combatTextKey(value).replace(/^the /, '')

/** False only when the source's explicit keyword restriction rules the unit out. */
export const combatRuleEligible = (description: string, keywords: readonly string[], recipient?: string) =>
  combatTargetAdmits(combatRuleTarget(description, recipient), keywords)

/**
 * The keywords a rule's words restrict it to: alternatives of keyword terms, and terms that rule a unit out.
 * Null where the words name no restriction.
 */
export type CombatTarget = { excluded: string[]; allowed: string[][] }

export function combatRuleTarget(description: string, recipient?: string): CombatTarget | null {
  description = description.replaceAll('^', '')
  const target = recipient ?? ruleSection(description, 'Target') ?? combatRuleRecipient(description)
  if (!target) return null
  const terms = (value: string) => {
    // Bold keywords either side of a slash, as **BOYZ**/**KOMMANDOS**, are one slashed list.
    const bold = [...value.replaceAll('**/**', '/').matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]!)
    return bold.length ? bold : [...value.matchAll(/\b[A-Z][A-Z0-9'’-]+(?:[ -][A-Z][A-Z0-9'’-]+)*\b/g)].map((match) => match[0])
  }
  const excluded = /\(excluding ([^)]+)\)/i.exec(target)
  return {
    excluded: excluded ? terms(excluded[1]!).flatMap(slashedKeywords) : [],
    allowed: target
      .replace(excluded?.[0] ?? '\0', '')
      .split(/\s+or\s+/i)
      .map(terms)
      .flatMap((alternative) =>
        alternative.reduce<string[][]>(
          (chosen, term) => chosen.flatMap((before) => slashedKeywords(term).map((one) => [...before, one])),
          [[]],
        ),
      )
      .filter((alternative) => alternative.length),
  }
}

/**
 * Each keyword a slashed list names. Whether the first one's leading words, as ADEPTUS ASTARTES in ADEPTUS ASTARTES
 * INFANTRY/MOUNTED, belong to the rest or end a keyword of their own, as BREAKA in BREAKA BOYZ/FLASH GITZ, the words
 * cannot say, so the rest are read both ways.
 */
function slashedKeywords(term: string) {
  const [first, ...rest] = term.split('/').map((part) => part.trim())
  const leading = first!.includes(' ') ? first!.slice(0, first!.lastIndexOf(' ') + 1) : ''
  return [first!, ...rest.flatMap((part) => (leading ? [part, leading + part] : [part]))]
}

export function combatTargetAdmits(target: CombatTarget | null, keywords: readonly string[]) {
  if (!target) return true
  const known = keywords.map(combatTextKey)
  const matches = (phrase: string) => combatKeywordPhraseMatches(combatTextKey(phrase), known)
  if (target.excluded.some(matches)) return false
  return !target.allowed.length || target.allowed.some((alternative) => alternative.every(matches))
}

const compiledRule = (rule: CombatRule) => (rule.reading ? rule.reading.compiled : compileCombatRule(rule))
/** The roles a rule's words take, as recorded for its placement where a token stands for them. */
export const ruleRoles = (rule: CombatRule) => rule.reading?.roles ?? combatRuleRoles(rule.description)

// Which choices are named options matters only to a datasheet, so the simulator's choices leave it out.
export const combatRuleChoices = (rule: CombatRule) =>
  ruleChoices(rule, compiledRule(rule)).map(({ label, effects }) => ({ label, effects }))

/** The choices with the weapon abilities that change no roll, as [ASSAULT], for a datasheet that shows all a rule gives. */
export const shownRuleChoices = (rule: CombatRule) =>
  ruleChoices(rule, rule.reading ? (rule.reading.shown ?? rule.reading.compiled) : compileCombatRule(rule, { shown: true }))

function ruleChoices(rule: CombatRule, compiled: ReturnType<typeof compiledRule>): CombatRuleChoice[] {
  if (rule.included) return []
  if (compiled)
    return compiled.choices.map((choice) => ({
      ...choice,
      effects: choice.effects.flatMap((effect) => {
        const next = { ...effect }
        if (rule.appliedDefences?.includes('save')) {
          delete next.save
          delete next.improveSave
        }
        if (rule.appliedDefences?.includes('invulnerable-save')) delete next.invulnerable
        if (rule.appliedDefences?.includes('toughness')) delete next.toughness
        return Object.keys(next).some(
          (field) => !['role', 'phases', 'weapon', 'targetKeywords', 'excludedTargetKeywords', 'condition'].includes(field),
        )
          ? [next]
          : []
      }),
    }))
  if (rule.reading) return rule.reading.legacy
  const written = normalizeCombatText(ruleSection(rule.description, 'Effect') ?? rule.description)
  const aura = /^While a friendly (.+?) unit(?: \(excluding .+?\))? is within (\d+)" of (?:this model|the bearer), (.+)$/i.exec(written)
  const selectedAlly =
    /^Each time this model destroys an enemy unit, select one other friendly .+? unit within (\d+)" of (?:this model|it)\. Until the end of the phase, (.+)$/i.exec(
      written,
    )
  const text = aura?.[3] ?? selectedAlly?.[2] ?? written
  const range = aura && rule.scope === 'nearby' ? `Within ${aura[2]}"` : ''
  const phases = rule.phases?.length ? rule.phases : [...COMBAT_PHASES]
  if (
    rule.models !== 1 &&
    /(?:allocated to|equipped by) (?:this model|the bearer)|(?:this model|the bearer) (?:has|have) the Feel No Pain/i.test(text)
  )
    return []
  const attack = (effect: Omit<CombatRuleEffect, 'role' | 'phases'>, phase = phases): CombatRuleEffect => ({
    role: 'attacker',
    phases: phase,
    ...effect,
  })
  if (selectedAlly) {
    const selected = compileCombatRule({ ...rule, description: text })
    if (selected)
      return selected.choices.map((choice) => labelledChoice(`After ${rule.source} destroys a unit · Within ${selectedAlly[1]}"`, choice))
  }

  const conditionalGrant =
    /^Each time a model in that unit makes an attack, if that model has the (.+?) keyword or that enemy unit is the closest eligible target, that attack has the \[([^\]]+)\] ability\.?$/i.exec(
      text,
    )
  if (conditionalGrant && combatKeyword(conditionalGrant[2]!)) {
    const hasKeyword = rule.keywords && ruleAnswers(rule)(`is:${combatTextKey(conditionalGrant[1]!)}`)
    return [
      {
        label: [range, hasKeyword ? '' : 'Closest eligible target'].filter(Boolean).join(' · ') || 'Active',
        effects: [attack({ keyword: conditionalGrant[2]! })],
      },
    ]
  }

  const tokens =
    /^Once per battle for each .+? token this unit has, you can change the result of one Hit roll or one Wound roll made for a model in this unit(?: \(excluding (.+?) models\))? to an unmodified 6\.(?: Designer's Note: .*)?$/i.exec(
      text,
    )
  if (tokens) {
    const excluded = tokens[1] ? { excludedModelKeywords: tokens[1].split(/,\s*|\s+or\s+/i) } : {}
    return (['ranged', 'melee'] as const).flatMap((phase) =>
      (['hit', 'wound'] as const).map((roll) => ({
        label: `${phase === 'ranged' ? 'Shooting' : 'Melee'} ${roll} roll`,
        effects: [attack({ unmodifiedSix: roll, ...excluded }, [phase])],
      })),
    )
  }

  const markedTarget =
    /^If your Army Faction is .+?, at the start of your Command phase, select one unit from your opponent's army\. Until the start of your next Command phase, that enemy unit is your (.+?) target\. Each time a model with this ability makes an attack that targets your \1 target: ■ You can re-roll the Hit roll\.? ■ If (.+), add 1 to the Wound roll as well\.?$/i.exec(
      text,
    )
  if (markedTarget)
    return [
      { label: 'Against the selected target', effects: [attack({ options: { hitReroll: 'failed' } })] },
      { label: 'With the wound bonus', effects: [attack({ options: { hitReroll: 'failed', woundModifier: 1 } })] },
    ]

  const volley =
    /^In your Shooting phase, when this unit is selected to shoot, select up to one visible enemy unit\. While making those attacks, this unit's (.+) attacks that targeted that enemy unit have \+([1-9]) A\.?$/i.exec(
      text,
    )
  if (volley)
    return [
      {
        label: 'Against the selected target',
        effects: [attack({ weapon: volley[1], characteristic: { kind: 'attacks', add: Number(volley[2]) } }, ['ranged'])],
      },
    ]
  return []
}

/** A recipient must be granted an effect; proximity that only protects the source is not an aura. */
export function combatRuleRecipient(written: string) {
  const description = printedRule(written)
  return (
    /While a friendly ([\s\S]+?) is within \d+["“”] of (?:this model|this unit|the bearer),/i.exec(description)?.[1] ??
    /select (?:one|a) (?:other )?friendly ([\s\S]+?) within \d+["“”]/i.exec(description)?.[1] ??
    /select one ([^.;]+? unit) that was set up on the battlefield using the Deep Strike ability this turn/i.exec(description)?.[1] ??
    /weapons equipped by friendly ([^.,]+?) models/i.exec(description)?.[1] ??
    /each time a friendly ([^.,]+? model) makes/i.exec(description)?.[1] ??
    (/each time an attack targets either your [^,]+? unit, or a unit that is not [\s\S]+?visible to the attacking model because of/i.test(
      description,
    )
      ? 'a unit'
      : undefined)
  )
}

export function combatRuleRoles(description: string): CombatRuleEffect['role'][] {
  const text = normalizeCombatText((ruleSection(description, 'Effect') ?? description).split(/\*{0,3}Example:/i)[0]!)
  const offensiveTarget = /select [^.]*enemy|enemy unit hit by|that targets (?:a|an|the closest|your .+? target)/i.test(text)
  const attackingText = text.replace(/(?:until|after|just after) (?:an enemy|the attacking) unit [^.]*?(?:attacks|fought|shot), /gi, '')
  const attacking =
    /(?:a model (?:in|with)|this model|the bearer|this unit|model from your army)[^.;]*?makes? (?:a ranged |a melee |a psychic |a |an )attack|model from your army targets|weapons? equipped|(?:this|that|your) unit(?:'s)?[^.;]*?(?:attacks?[^.;]*?have|weapons? have)|(?:this unit['’]s|friendly (?:(?!attacking|enemy)[^.;])*?(?:units?|models)['’]s?) (?:ranged |melee |\[psychic\] )?(?:attacks|weapons)|(?:friendly [^.;]*?units?|unit from your army) (?:is|are) selected to (?:fight|shoot)|re-roll (?:one |the )?(?:hit|wound|damage) rolls?|change the result of one (?:hit|wound) roll|critical hit|lethal hits|sustained hits|devastating wounds|ignores cover|twin-linked|\+[1-9]\s*A\b/i.test(
      attackingText,
    )
  // Wording the compiler cannot read still names a roll or characteristic of the unit's own attacks, so it is reported rather than dropped.
  const ownAttacks = attackingText.replace(
    /[^.;]*?\b(?:is allocated to|saving throw|made against|the attacking (?:model|unit)|an enemy unit is within|targets? (?:(?:this|that|your|the bearer's) (?:unit|model)|the bearer|this model|a model in (?:this|that|your) unit|friendly|an? [^.;]*?unit from your army))[^.;]*/gi,
    '',
  )
  const attackTerms =
    /\b(?:hit|wound) rolls?\b|makes? an? psychic attack|\b(?:attacks|strength|armour penetration|damage|ballistic skill|weapon skill)(?: characteristics?)? of (?:[^.;]*?\bweapons\b|(?:the bearer's|this model's|this unit's|its) )|\+[1-9]\s*(?:WS|BS|S|AP|D)\b/i.test(
      ownAttacks,
    )
  // An attack the unit makes is not one made against it, unless it is aimed at this unit.
  const incoming = text.replace(
    /(?:a model|this model|the bearer|this unit|model from your army)[^.;]*?makes? (?:a ranged |a melee |a psychic |a |an )attack(?! (?:that )?targets? (?:(?:this|your|the bearer's) (?:unit|model)\b(?!['’]s)|the bearer\b))[^,.;]*/gi,
    '',
  )
  const defending =
    /(?:attack|attacks) (?:that )?(?:targets?|is allocated to|(?:is |are )?made against) (?:(?:this|that|your) (?:unit|model)|the bearer|a model)|saving throw|invulnerable|feel no pain|(?:has|have|add|improve)[^.;]*?(?:toughness|save characteristic|wounds characteristic)|damage characteristic of (?:that|the) attack|stealth|benefit of cover/i.test(
      incoming,
    )
  const enemyWeapons =
    /(?:weapons? equipped by|attacks? made by) (?:models in )?(?:that enemy|enemy|the attacking) unit|enemy unit [^.;]*?each time a model in that unit makes/i.test(
      text,
    )
  // A state other rules ask for, as both Doctrina Imperatives or being wholly within the Flow of Magic, can change how a unit attacks and is attacked.
  const activates = /\bare both active for\b|\b(?:it|this unit|that unit) is wholly within your army['’]s\b/i.test(text)
  const attacker =
    activates ||
    (offensiveTarget && (attacking || defending || /mortal wounds/i.test(text))) ||
    ((attacking || attackTerms) && !enemyWeapons)
  // Names the side's own units outright, so an offensive clause elsewhere in the rule cannot make it the enemy's.
  const ownDefending = /attacks? (?:that )?targets? (?:friendly|an? [^.;]*?unit from your army)/i.test(incoming)
  const defender = activates || enemyWeapons || ownDefending || (defending && !offensiveTarget)
  return [...(attacker ? ['attacker' as const] : []), ...(defender ? ['defender' as const] : [])]
}

/**
 * Core rule 19.04: what affects a unit or models in it reaches its whole attached unit. A trigger the unit rolls once, as for
 * a charge, must not, or each member would roll it. A combined estimate ends a defence from the bodyguards on the leader once
 * they are destroyed (`calculateCombatSequence`).
 */
const REACHES_ATTACHED_UNIT =
  /leading a unit|this model's unit|bearer's unit|(?:a model|models) in (?:this|that) unit|this unit's (?:(?:ranged|melee) )?attacks|equipped by this unit|\battacks? (?:that )?targets? this unit|\bthis unit has\b/i

/**
 * What judging a rule's place in a roster reads of its words: whether it issues Orders and to whom, which
 * units it reaches, and the keywords it restricts its recipients to.
 */
export type CombatJudging = {
  orders?: { target: CombatTarget | null }
  selectsOther?: true
  leading?: true
  reachesAttached?: true
  recipient?: true
  target: CombatTarget | null
  recipientTarget?: CombatTarget | null
}

export function combatJudgingOf(description: string): CombatJudging {
  if (isOrdersRule(description)) {
    const recipient = ordersRecipient(description)
    return { orders: { target: recipient ? combatRuleTarget(description, recipient) : null }, target: null }
  }
  const recipient = combatRuleRecipient(description)
  return {
    ...(/select (?:one|a) other friendly/i.test(description) ? { selectsOther: true as const } : {}),
    ...(/^While this model is leading a unit,/i.test(description) ? { leading: true as const } : {}),
    ...(REACHES_ATTACHED_UNIT.test(printedPhrasing(normalizeCombatText(markedBullets(description))))
      ? { reachesAttached: true as const }
      : {}),
    ...(recipient ? { recipient: true as const, recipientTarget: combatRuleTarget(description, recipient) } : {}),
    target: combatRuleTarget(description),
  }
}

/**
 * How a rule's words are read while judging it: from the words themselves, or from what was recorded of them
 * where a token stands for them, which gives each placement its reading or null where none was recorded.
 */
export type CombatText = { judging: CombatJudging; readingFor?: (rule: CombatRule) => CombatReading | null }

/** A rule as it applies to a unit, judged from its words in its place in the roster, or null when it takes no part. */
export function judgedCombatRule(
  rule: CombatRule,
  judge: CombatRuleJudge,
  text: CombatText = { judging: combatJudgingOf(rule.description) },
): CombatRule | null {
  const { judging } = text
  const read = (placed: CombatRule) => {
    const reading = text.readingFor?.(placed)
    return reading ? { ...placed, reading } : placed
  }
  let scope = rule.scope
  // Orders reach any unit an officer chooses, so every unit fields the army rule and officers' own copies step aside.
  if (judging.orders)
    return judge.origin === 'army' && combatTargetAdmits(judging.orders.target, judge.keywords)
      ? read({ ...rule, keywords: judge.keywords })
      : null
  if (judge.origin === 'army') return null
  if (judge.origin === 'own') {
    if (judging.selectsOther) return null
    scope = judge.attached && judging.leading ? 'attached' : 'unit'
  } else if (judge.origin === 'support') {
    if (judge.attached && judging.reachesAttached) scope = 'attached'
    else if (judging.recipient) scope = 'nearby'
    else return null
  }
  const judged = read({ ...rule, scope, keywords: judge.keywords })
  const eligible =
    combatTargetAdmits(judging.target, scope === 'stratagem' ? judge.unitKeywords : judge.keywords) ||
    (scope === 'stratagem' &&
      judging.recipient !== undefined &&
      combatTargetAdmits(judging.recipientTarget ?? null, judge.keywords) &&
      judge.supportKeywords.some((keywords) => combatTargetAdmits(judging.target, keywords)))
  return combatRuleIsRelevant(judged) && eligible ? judged : null
}

function combatRuleIsRelevant(rule: CombatRule) {
  const compiled = compiledRule(rule)
  return (
    (compiled ? compiled.choices.some((choice) => choice.effects.length) : ruleRoles(rule).length > 0) ||
    namesOptions(shownRuleChoices(rule))
  )
}

export function combatEffectAppliesTo(effect: CombatRuleEffect, role: CombatRuleEffect['role'], opposingKeywords?: readonly string[]) {
  return effect.role === role && (opposingKeywords === undefined || matchesEffectTarget(effect, opposingKeywords))
}

export function combatRuleAppliesTo(rule: CombatRule, role: CombatRuleEffect['role'], opposingKeywords?: readonly string[]) {
  const compiled = compiledRule({ ...rule, included: false })
  if (compiled)
    return compiled.choices.some((choice) => choice.effects.some((effect) => combatEffectAppliesTo(effect, role, opposingKeywords)))
  const choices = combatRuleChoices({ ...rule, included: false })
  return (
    choices.some((choice) => choice.effects.some((effect) => combatEffectAppliesTo(effect, role, opposingKeywords))) ||
    (role === 'defender' && Boolean(rule.appliedDefences?.length)) ||
    (Boolean(rule.included) && ruleRoles(rule).includes(role))
  )
}

export function combatRuleDefault(rule: CombatRule) {
  if (rule.included) return 0
  const compiled = compiledRule(rule)
  if (compiled) return compiled.defaultChoice
  if (rule.reading) return rule.reading.legacyDefault
  if (!combatRuleChoices(rule).length) return 0
  const text = normalizeCombatText(rule.description)
  return (rule.scope === 'attached' && /^While this model is leading a unit, /i.test(text)) ||
    (rule.scope === 'unit' &&
      (/^Each time (?:an attack is allocated to this model|a model in this unit makes (?:an|a ranged|a melee) attack), /i.test(text) ||
        (/^While a friendly /i.test(text) && combatRuleChoices(rule)[0]?.label === 'Active')))
    ? 1
    : 0
}

export function combatRuleProfiles(
  sheet: Datasheet,
  rules: readonly ActiveCombatRule[],
  role: CombatRuleEffect['role'],
  targetKeywords: readonly string[] = [],
  opposingRules: readonly ActiveCombatRule[] = [],
): Datasheet {
  const scoped = [
    ...rules.map((rule) => ({ rule, role, keywords: targetKeywords })),
    ...opposingRules.map((rule) => ({ rule, role: role === 'attacker' ? 'defender' : 'attacker', keywords: sheet.keywords })),
  ]
  return {
    ...sheet,
    profiles: sheet.profiles.map((profile) => {
      const phase = weaponPhase(profile.type)
      if (!phase) return profile
      let values = profile.values
      const weaponKinds = new Set(
        splitWeaponKeywords(profile.values.find((value) => datasheetCharacteristicKind(value.name) === 'keywords')?.value).map(
          (keyword) => combatKeyword(keyword)?.kind,
        ),
      )
      const adjustments = new Map<
        DatasheetCharacteristicKind,
        { positive: number; negative: number; exclusive: number; set?: number; sources: string[] }
      >()
      for (const { rule, role: effectRole, keywords } of scoped)
        for (const effect of rule.effects) {
          if (
            effect.role !== effectRole ||
            !effect.phases.includes(phase) ||
            effect.condition ||
            (effect.requiresWeaponKeyword && !weaponKinds.has(combatKeywordKind(effect.requiresWeaponKeyword))) ||
            !matchesEffectTarget(effect, keywords) ||
            (effect.weapon && weaponKey(effect.weapon) !== weaponKey(profile.name))
          )
            continue
          if (effect.characteristic) {
            const modifier = effect.characteristic
            const original = profile.values.find((value) => datasheetCharacteristicKind(value.name) === modifier.kind)
            if (effectRole !== role || !combatRuleProjected(rule, original?.modifiers)) {
              const adjustment = adjustments.get(modifier.kind) ?? { positive: 0, negative: 0, exclusive: 0, sources: [] }
              if (modifier.set !== undefined) adjustment.set = modifier.set
              else if (modifier.nonCumulative) adjustment.exclusive = Math.min(adjustment.exclusive, modifier.add)
              else if (modifier.add < 0) adjustment.negative += modifier.add
              else adjustment.positive += modifier.add
              adjustment.sources.push(rule.name)
              adjustments.set(modifier.kind, adjustment)
            }
          }
          if (effect.keyword) {
            const keyword = effect.keyword
            const existing = values.find((value) => datasheetCharacteristicKind(value.name) === 'keywords')
            const printed = profile.values.find((value) => datasheetCharacteristicKind(value.name) === 'keywords')
            const held = splitWeaponKeywords(existing?.value)
            // The catalogue may print a granted keyword in its own words, so one it credits to this rule counts by kind.
            if (
              effectRole === role &&
              combatRuleProjected(rule, printed?.modifiers) &&
              splitWeaponKeywords(printed?.value).some((value) => combatKeywordKind(value) === combatKeywordKind(keyword))
            )
              continue
            const numbered = combatKeyword(keyword)
            if (held.some((value) => combatTextKey(value) === combatTextKey(keyword))) continue
            if (numbered?.amount !== undefined && !numbered.target) {
              const bounds = (amount: NonNullable<typeof numbered.amount>) =>
                typeof amount === 'number' ? [amount, amount] : [amount.dice + amount.bonus, amount.dice * amount.sides + amount.bonus]
              const [low, high] = bounds(numbered.amount)
              const previous = held.flatMap((value) => {
                const parsed = combatKeyword(value)
                return parsed?.kind === numbered.kind && parsed.amount !== undefined && !parsed.target
                  ? [{ value, bounds: bounds(parsed.amount) }]
                  : []
              })
              if (previous.some(({ bounds: [minimum] }) => minimum! >= high!)) continue
              for (const {
                value,
                bounds: [, maximum],
              } of previous)
                if (low! >= maximum!) held.splice(held.indexOf(value), 1)
            }
            const next = {
              name: existing?.name ?? 'Keywords',
              value: [...held, keyword].join(', '),
              baseValue: existing?.baseValue ?? existing?.value ?? '',
              modifiers: [...new Set([...(existing?.modifiers ?? []), rule.name])],
            }
            values = existing ? values.map((value) => (value === existing ? next : value)) : [...values, next]
          }
        }
      values = values.map((value) => {
        const kind = datasheetCharacteristicKind(value.name)
        const adjustment = adjustments.get(kind)
        if (!adjustment) return value
        const existingImprovement =
          kind === 'armour-penetration' && value.baseValue ? Math.min(0, Number(value.value) - Number(value.baseValue)) : 0
        const add = adjustment.positive + Math.min(adjustment.negative, adjustment.exclusive - existingImprovement)
        return adjustedCharacteristic(value, add, adjustment.sources, adjustment.set)
      })
      return { ...profile, values }
    }),
  }
}

type Characteristic = Datasheet['profiles'][number]['values'][number]

/** A weapon characteristic with `add` applied to its printed number and its sources recorded; a value it cannot apply to stays as it is. */
export function adjustedCharacteristic(value: Characteristic, add: number, sources: readonly string[], set?: number): Characteristic {
  const kind = datasheetCharacteristicKind(value.name)
  const starting = set === undefined ? value.value : String(set)
  let adjusted: string
  if ((kind === 'attacks' || kind === 'damage') && !/^\d+$/.test(starting)) {
    const dice = diceExpression(starting)
    if (!dice || !dice.dice || dice.bonus + add < 0) return value
    const bonus = dice.bonus + add
    adjusted = `${dice.dice === 1 ? '' : dice.dice}D${dice.sides}${bonus ? `+${bonus}` : ''}`
  } else {
    if (!/^-?\d+[+"]?$/.test(starting)) return value
    const next = Number.parseInt(starting) + add
    const bounded =
      kind === 'armour-penetration'
        ? Math.min(0, next)
        : kind === 'ballistic-skill' || kind === 'weapon-skill'
          ? Math.max(2, Math.min(6, next))
          : Math.max(1, next)
    adjusted = `${bounded}${/[+"]$/.exec(value.value)?.[0] ?? ''}`
  }
  return {
    ...value,
    value: adjusted,
    baseValue: value.baseValue ?? value.value,
    modifiers: [...new Set([...(value.modifiers ?? []), ...sources])],
  }
}

export function combatRuleOptions(
  rules: readonly ActiveCombatRule[],
  role: CombatRuleEffect['role'],
  phase: CombatPhase,
  targetKeywords: readonly string[] = [],
): Partial<CombatOptions> {
  const result: Partial<CombatOptions> = {}
  for (const rule of rules)
    for (const effect of rule.effects) {
      if (
        effect.role !== role ||
        !effect.phases.includes(phase) ||
        !effect.options ||
        effect.condition ||
        effect.requiresWeaponKeyword ||
        effect.weapon
      )
        continue
      // Every attack in a matchup has the one target, so a single-die re-roll for some targets holds for all of them or none.
      if (effect.targetKeywords || effect.excludedTargetKeywords) {
        if (effect.options.singleRerolls && matchesEffectTarget(effect, targetKeywords))
          result.singleRerolls = [...(result.singleRerolls ?? []), ...effect.options.singleRerolls]
        continue
      }
      if (effect.options.cover) result.cover = true
      for (const field of ['hitModifier', 'woundModifier'] as const) result[field] = (result[field] ?? 0) + (effect.options[field] ?? 0)
      result.positiveWoundModifier = (result.positiveWoundModifier ?? 0) + Math.max(0, effect.options.woundModifier ?? 0)
      result.psychicHitModifier = (result.psychicHitModifier ?? 0) + Math.max(0, effect.options.hitModifier ?? 0)
      for (const field of ['hitReroll', 'woundReroll'] as const) {
        const next = effect.options[field]
        if (next && rerollRank[next] > rerollRank[result[field] ?? 'none']) result[field] = next
      }
      if (effect.options.singleRerolls) result.singleRerolls = [...(result.singleRerolls ?? []), ...effect.options.singleRerolls]
    }
  return result
}

export function combatRuleDefences(
  target: CombatInput['target'],
  rules: readonly ActiveCombatRule[],
  phase: CombatPhase,
  attackRules: readonly ActiveCombatRule[] = [],
  /** Whether an effect limited to some models reaches a group, which every other effect does. */
  reaches: (effect: CombatRuleEffect, group: number) => boolean = () => true,
): CombatInput['target'] {
  const defending = (effect: CombatRuleEffect) => effect.role === 'defender' && effect.phases.includes(phase)
  const within = (where: (effect: CombatRuleEffect) => boolean) =>
    rules.map((rule) => ({ ...rule, effects: rule.effects.filter((effect) => defending(effect) && where(effect)) }))
  const everywhere = within((effect) => target.groups.every((_, at) => reaches(effect, at)))
  const attacks = [...new Map(attackRules.map((rule) => [combatTextKey(rule.name), rule])).values()]
    .flatMap((rule) => rule.effects)
    .filter((effect) => effect.role === 'attacker' && effect.phases.includes(phase))
  const printed = Object.fromEntries(UNIT_DEFENCES.map((field) => [field, target[field]])) as UnitDefences
  const unit = unitDefences(everywhere, printed)
  return {
    ...target,
    groups: target.groups.map((group, at) => {
      const own = within((effect) => reaches(effect, at))
      const effects = own.flatMap((rule) => rule.effects)
      const bestRoll = <T extends number | null | undefined>(initial: T) =>
        effects.reduce<number | T>(
          (roll, effect) => (effect.invulnerable === undefined ? roll : Math.min(roll ?? 7, effect.invulnerable)),
          initial,
        )
      const limited = effects.length > everywhere.flatMap((rule) => rule.effects).length
      return {
        ...group,
        ...(limited ? unitDefences(own, { ...printed, ...definedOf(group) }) : {}),
        invulnerable: bestRoll(group.invulnerable),
        save: Math.max(
          2,
          Math.min(
            7,
            effects.reduce(
              (roll, effect) =>
                effect.improveSave ? Math.min(roll, Math.max(effect.improveSave.best, roll - effect.improveSave.by)) : roll,
              effects.reduce((roll, effect) => (effect.save === undefined ? roll : Math.min(roll, effect.save)), group.save),
            ) + attacks.reduce((total, effect) => total + (effect.targetSaveModifier ?? 0), 0),
          ),
        ),
        toughness: Math.max(
          1,
          group.toughness +
            effects.reduce((total, effect) => total + (effect.toughness ?? 0), 0) +
            attacks.reduce((total, effect) => total + (effect.targetToughness ?? 0), 0),
        ),
      }
    }),
    ...unit,
  }
}

type UnitDefences = Pick<
  CombatInput['target'],
  'feelNoPain' | 'psychicFeelNoPain' | 'mortalFeelNoPain' | 'damageReduction' | 'damageDivisor'
>
const UNIT_DEFENCES = ['feelNoPain', 'psychicFeelNoPain', 'mortalFeelNoPain', 'damageReduction', 'damageDivisor'] as const
/** The defences a group sets for itself rather than taking the unit's. */
const definedOf = (group: CombatInput['target']['groups'][number]) =>
  Object.fromEntries(UNIT_DEFENCES.flatMap((field) => (group[field] === undefined ? [] : [[field, group[field]]]))) as UnitDefences

/** The defences of a whole allocation group or unit that its rules' defending effects improve. */
function unitDefences(rules: readonly ActiveCombatRule[], start: UnitDefences): UnitDefences {
  const effects = rules.flatMap((rule) => rule.effects)
  const bestRoll = <T extends number | null | undefined>(field: 'feelNoPain' | 'psychicFeelNoPain' | 'mortalFeelNoPain', initial: T) =>
    effects.reduce<number | T>((roll, effect) => (effect[field] === undefined ? roll : Math.min(roll ?? 7, effect[field])), initial)
  return {
    damageDivisor: effects.reduce((divisor, effect) => Math.max(divisor, effect.damageDivisor ?? 1), start.damageDivisor ?? 1),
    feelNoPain: bestRoll('feelNoPain', start.feelNoPain),
    psychicFeelNoPain: bestRoll('psychicFeelNoPain', start.psychicFeelNoPain),
    mortalFeelNoPain: bestRoll('mortalFeelNoPain', start.mortalFeelNoPain),
    damageReduction: [...new Map(rules.map((rule) => [rule.name, rule])).values()].reduce(
      (amount, rule) => amount + Math.max(0, ...rule.effects.map((effect) => effect.damageReduction ?? 0)),
      start.damageReduction ?? 0,
    ),
  }
}

function matchesEffectTarget(effect: CombatRuleEffect, keywords: readonly string[]) {
  const held = keywords.map(combatTextKey)
  const matches = (phrase: string) => combatKeywordPhraseMatches(combatTextKey(phrase), held)
  return (!effect.targetKeywords || effect.targetKeywords.some(matches)) && !effect.excludedTargetKeywords?.some(matches)
}

/** How many of its own models the attacker destroys for its abilities before attacking the target in a phase. */
export const combatRuleSacrifices = (rules: readonly ActiveCombatRule[], phase: CombatPhase, targetKeywords: readonly string[]) =>
  rules
    .flatMap((rule) => rule.effects)
    .filter((effect) => effect.role === 'attacker' && effect.phases.includes(phase) && matchesEffectTarget(effect, targetKeywords))
    .reduce((total, effect) => total + (effect.mortalWounds?.sacrifice ?? 0), 0)

export function combatRuleMortals(
  rules: readonly ActiveCombatRule[],
  phase: CombatPhase,
  targetKeywords: readonly string[],
  weapons: readonly { profile: { name: string } }[],
  models: number,
  toughness: number | null = null,
) {
  return [...new Map(rules.map((rule) => [rule.name, rule])).values()].flatMap((rule) =>
    rule.effects.flatMap((effect) => {
      const mortals = effect.mortalWounds
      if (
        effect.role !== 'attacker' ||
        !effect.phases.includes(phase) ||
        !matchesEffectTarget(effect, targetKeywords) ||
        (effect.weapon && !weapons.some(({ profile }) => weaponKey(profile.name) === weaponKey(effect.weapon!))) ||
        !mortals ||
        (mortals.perToughness && !toughness)
      )
        return []
      return [{ ...mortals, rolls: mortals.perToughness ? toughness! : mortals.perModel ? models : mortals.rolls }]
    }),
  )
}

type RuledMember = { sheet: Datasheet; rules?: readonly ActiveCombatRule[] }

/** An attached unit whose members keep a rule's bearer-only effects to the member whose rule it is. */
export function withBearerEffects<Unit extends RuledMember & { companions?: readonly RuledMember[] }>(unit: Unit): Unit {
  if (!unit.companions?.length) return unit
  const names = new Set([unit, ...unit.companions].map((member) => member.sheet.name))
  const own = <Member extends RuledMember>(member: Member): Member => ({
    ...member,
    rules: member.rules?.map((rule) =>
      rule.source && rule.source !== member.sheet.name && names.has(rule.source) && rule.effects.some((effect) => effect.bearerOnly)
        ? { ...rule, effects: rule.effects.filter((effect) => !effect.bearerOnly) }
        : rule,
    ),
  })
  return { ...own(unit), companions: unit.companions.map(own) }
}

type CarriedMember = RuledMember & { carriers: readonly CombatCarrier[] }

/**
 * How many of a carrier's models an effect reaches, or undefined where it reaches all of them: models matching one of its
 * `modelKeywords` and none of its `excludedModelKeywords`, by the unit's keywords every model has, their own or their
 * name, and for a bearer-only effect of a rule wargear gives some of the models, the models holding it.
 */
export function effectModels(
  effect: CombatRuleEffect,
  rule: Pick<ActiveCombatRule, 'heldBy'>,
  member: CarriedMember,
): ((carrier: CombatCarrier) => number) | undefined {
  const { heldBy } = rule
  const bearers = effect.bearerOnly && heldBy && member.carriers.some((carrier) => carrier.abilities?.[heldBy]) ? heldBy : undefined
  if (!effect.modelKeywords && !effect.excludedModelKeywords && !bearers) return undefined
  const partial = new Set((member.sheet.modelKeywords ?? []).flatMap((group) => group.keywords).map(combatTextKey))
  const shared = member.sheet.keywords.map(combatTextKey).filter((keyword) => !partial.has(keyword))
  const own = (carrier: CombatCarrier) => [
    ...shared,
    ...[
      carrier.name,
      ...(carrier.keywords ?? []),
      ...(member.sheet.modelKeywords ?? []).flatMap((group) =>
        group.models.some((model) => combatTextKey(model) === combatTextKey(carrier.name)) ? group.keywords : [],
      ),
    ].map(combatTextKey),
  ]
  const matches = (selectors: readonly string[] | undefined, held: readonly string[]) =>
    selectors?.some((selector) => combatKeywordPhraseMatches(combatTextKey(selector), held))
  return (carrier) => {
    const held = own(carrier)
    if (effect.modelKeywords && !matches(effect.modelKeywords, held)) return 0
    if (matches(effect.excludedModelKeywords, held)) return 0
    return bearers ? Math.min(carrier.models, carrier.abilities?.[bearers] ?? 0) : carrier.models
  }
}

/** The carriers that field models, with none standing for the unit where it records no ownership. */
const fielding = (member: CarriedMember) => {
  const carriers = member.carriers.filter((carrier) => carrier.models > 0 && !carrier.unitWide)
  return carriers.length ? carriers : [{ name: member.sheet.name, models: 1, weapons: [] }]
}

/**
 * A member whose attacks keep each effect limited to some of its models to those models' weapons: a weapon only those
 * models carry takes it, one others carry too goes without, and mortal wounds rolled per model count only those models.
 */
export function withModelAttacks<Member extends CarriedMember>(member: Member): Member {
  const carriers = fielding(member)
  const weapons = member.sheet.profiles.filter((profile) => weaponPhase(profile.type))
  const scoped = (effect: CombatRuleEffect, rule: ActiveCombatRule): CombatRuleEffect[] => {
    const models = effect.role === 'attacker' ? effectModels(effect, rule, member) : undefined
    if (!models) return [effect]
    const { modelKeywords: _modelKeywords, excludedModelKeywords: _excludedModelKeywords, ...free } = effect
    const counts = carriers.map((carrier) => ({ carrier, reached: models(carrier) }))
    const total = counts.reduce((sum, { reached }) => sum + reached, 0)
    if (!total) return []
    if (counts.every(({ carrier, reached }) => reached === carrier.models)) return [free]
    if (free.mortalWounds && !free.weapon)
      return [{ ...free, mortalWounds: { ...free.mortalWounds, ...(free.mortalWounds.perModel ? { rolls: total, perModel: false } : {}) } }]
    const onlyReached = (name: string) => {
      const same = weapons.filter((profile) => weaponKey(profile.name) === weaponKey(name))
      const bearers = counts.filter(({ carrier }) => same.some((profile) => carriedCount(carrier, profile) > 0))
      return bearers.length > 0 && bearers.every(({ carrier, reached }) => reached === carrier.models)
    }
    if (free.weapon) return onlyReached(free.weapon) ? [free] : []
    return uniqueBy(weapons, (profile) => weaponKey(profile.name)).flatMap((profile) =>
      onlyReached(profile.name) ? [{ ...free, weapon: profile.name }] : [],
    )
  }
  return {
    ...member,
    rules: member.rules?.map((rule) => ({ ...rule, effects: rule.effects.flatMap((effect) => scoped(effect, rule)) })),
  }
}

/** A unit whose members' attacks keep bearer-only effects and effects limited to some models to those models. */
export function withMemberAttacks<Unit extends CarriedMember & { companions?: readonly CarriedMember[] }>(unit: Unit): Unit {
  const bearing = withBearerEffects(unit)
  return {
    ...withModelAttacks(bearing),
    ...(bearing.companions ? { companions: bearing.companions.map((member) => withModelAttacks(member)) } : {}),
  }
}

export function combatRuleWeapons(
  source: Datasheet,
  used: readonly { weapon: CombatWeapon | null; count: number; profile: { id: string; name: string } }[],
  rules: readonly ActiveCombatRule[],
  role: CombatRuleEffect['role'],
  phase: CombatPhase,
  targetKeywords: readonly string[],
  scopedOptions = false,
): CombatWeapon[] {
  return used.flatMap(({ weapon, count, profile }) => {
    if (!weapon) return []
    const next = { ...weapon, count }
    const applies = (effect: CombatRuleEffect) =>
      effect.role === role &&
      effect.phases.includes(phase) &&
      matchesEffectTarget(effect, targetKeywords) &&
      (!effect.weapon || weaponKey(effect.weapon) === weaponKey(profile.name))
    for (const rule of rules)
      for (const effect of rule.effects) {
        if (!applies(effect)) continue
        if (effect.requiresWeaponKeyword) {
          const matches = (keyword: string) => {
            const held = combatKeyword(keyword)
            const required = combatKeyword(effect.requiresWeaponKeyword!)
            return Boolean(held && required && held.kind === required.kind && combatKeywordApplies(held, targetKeywords))
          }
          const original = source.profiles.find((candidate) => candidate.id === profile.id)
          const keywords = splitWeaponKeywords(
            original?.values.find((value) => datasheetCharacteristicKind(value.name) === 'keywords')?.value,
          )
          const otherGrant = rules.some(
            (other) =>
              other.name !== rule.name &&
              other.effects.some(
                (grant) => applies(grant) && !grant.condition && !grant.requiresWeaponKeyword && grant.keyword && matches(grant.keyword),
              ),
          )
          if (!keywords.some(matches) && !otherGrant) continue
        }
        if (effect.damageReroll && next.damageReroll !== 'any') next.damageReroll = effect.damageReroll
        for (const field of ['criticalHit', 'criticalWound'] as const) {
          const threshold = effect[field]
          const requires = field === 'criticalHit' ? 'criticalHitRequiresSuccess' : 'criticalWoundRequiresSuccess'
          const destination = effect[requires] ? (field === 'criticalHit' ? 'successfulCriticalHit' : 'successfulCriticalWound') : field
          if (threshold !== undefined) next[destination] = Math.min(next[destination] ?? 6, threshold)
        }
        for (const field of ['ignoreHitModifiers', 'ignoreWoundModifiers', 'ignoreSkillModifiers'] as const)
          if (effect[field]) next[field] = true
        if (effect.allHitsCritical) next.allHitsCritical = true
        if (effect.unmodifiedSix) next.unmodifiedSix = effect.unmodifiedSix
        if (effect.condition === 'critical-wound' && effect.characteristic?.kind === 'armour-penetration')
          next.criticalAp = (next.criticalAp ?? 0) + (effect.characteristic.add ?? 0)
        if (effect.condition === 'stronger')
          next.strongerWoundModifier = (next.strongerWoundModifier ?? 0) + (effect.options?.woundModifier ?? 0)
        if (effect.condition === 'not-stronger')
          next.notStrongerWoundModifier = (next.notStrongerWoundModifier ?? 0) + (effect.options?.woundModifier ?? 0)
        if (effect.condition === 'double-strength')
          next.doubleStrengthWoundModifier = (next.doubleStrengthWoundModifier ?? 0) + (effect.options?.woundModifier ?? 0)
        if (effect.condition || (!scopedOptions && !effect.weapon && !effect.targetKeywords && !effect.excludedTargetKeywords)) continue
        for (const field of ['hitModifier', 'woundModifier'] as const) next[field] = (next[field] ?? 0) + (effect.options?.[field] ?? 0)
        next.positiveHitModifier = (next.positiveHitModifier ?? 0) + Math.max(0, effect.options?.hitModifier ?? 0)
        next.positiveWoundModifier = (next.positiveWoundModifier ?? 0) + Math.max(0, effect.options?.woundModifier ?? 0)
        for (const field of ['hitReroll', 'woundReroll'] as const) {
          const value = effect.options?.[field]
          if (value && rerollRank[value] > rerollRank[next[field] ?? 'none']) next[field] = value
        }
      }
    return [next]
  })
}
