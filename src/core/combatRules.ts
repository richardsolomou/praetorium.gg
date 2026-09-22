import type { Datasheet, DatasheetCharacteristicKind } from '../contracts/catalogue'
import { diceExpression, type CombatInput, type CombatOptions, type CombatWeapon } from './combat'
import { compileCombatRule } from './combatRuleCompiler'
import { datasheetCharacteristicKind, datasheetProfileKind } from './datasheetStructure'

type Phase = CombatOptions['phase']
export type CombatRule = {
  id: string
  name: string
  source: string
  description: string
  phases?: Phase[]
  scope: 'unit' | 'attached' | 'nearby' | 'stratagem' | 'detachment'
  included?: boolean
  appliedDefences?: DatasheetCharacteristicKind[]
  models?: number
  keywords?: readonly string[]
}
export type CombatRuleEffect = {
  role: 'attacker' | 'defender'
  phases: Phase[]
  keyword?: string
  characteristic?: { kind: DatasheetCharacteristicKind; add: number; nonCumulative?: boolean }
  weapon?: string
  targetKeywords?: string[]
  excludedTargetKeywords?: string[]
  condition?: 'stronger' | 'double-strength' | 'critical-wound'
  ignoreHitModifiers?: boolean
  ignoreWoundModifiers?: boolean
  ignoreSkillModifiers?: boolean
  criticalHit?: number
  criticalHitRequiresSuccess?: boolean
  criticalWound?: number
  criticalWoundRequiresSuccess?: boolean
  allHitsCritical?: boolean
  invulnerable?: number
  save?: number
  toughness?: number
  damageDivisor?: number
  options?: Partial<Pick<CombatOptions, 'hitModifier' | 'woundModifier' | 'hitReroll' | 'woundReroll' | 'cover'>>
  feelNoPain?: number
  psychicFeelNoPain?: number
  mortalFeelNoPain?: number
  mortalWounds?: NonNullable<CombatInput['mortalWounds']>[number] & { perModel?: boolean }
  damageReroll?: 'ones'
  damageReduction?: number
}
export type CombatRuleChoice = { label: string; effects: CombatRuleEffect[] }
export type ActiveCombatRule = { name: string; effects: CombatRuleEffect[] }

const both: Phase[] = ['ranged', 'melee']
const plain = (value: string) =>
  value
    .replaceAll(/<[^>]*>|\*|_|\^/g, '')
    .replaceAll(/[’‘]/g, "'")
    .replaceAll(/[“”]/g, '"')
    .replaceAll(/\breroll\b/gi, 're-roll')
    .replaceAll('▪', '■')
    .replaceAll(/\p{Pd}/gu, '-')
    .replaceAll(/\s+/g, ' ')
    .trim()
const key = (value: string) =>
  plain(value)
    .replace(/^faction:\s*/i, '')
    .toLowerCase()

/** False only when the source's explicit keyword restriction rules the unit out. */
export function combatRuleEligible(description: string, keywords: readonly string[], recipient?: string) {
  description = description.replaceAll('^', '')
  const target = recipient ?? /\*\*Target:\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/i.exec(description)?.[1] ?? combatRuleRecipient(description)
  if (!target) return true
  const known = keywords.map(key)
  const matches = (phrase: string) => {
    let remaining = key(phrase)
    for (const keyword of known.toSorted((a, b) => b.length - a.length)) {
      if (remaining === `${keyword}s`) return true
      remaining = remaining.replaceAll(new RegExp(`\\b${keyword.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '').trim()
    }
    return !remaining
  }
  const terms = (value: string) => {
    const bold = [...value.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]!)
    return bold.length ? bold : [...value.matchAll(/\b[A-Z][A-Z0-9'’-]+(?:[ -][A-Z][A-Z0-9'’-]+)*\b/g)].map((match) => match[0])
  }
  const excluded = /\(excluding ([^)]+)\)/i.exec(target)
  if (excluded && terms(excluded[1]!).some(matches)) return false
  const allowed = target
    .replace(excluded?.[0] ?? '\0', '')
    .split(/\s+or\s+/i)
    .map(terms)
    .filter((alternative) => alternative.length)
  return !allowed.length || allowed.some((alternative) => alternative.every(matches))
}

export function combatRuleChoices(rule: CombatRule): CombatRuleChoice[] {
  if (rule.included) return []
  const compiled = compileCombatRule(rule)
  if (compiled)
    return compiled.choices.map((choice) => ({
      ...choice,
      effects: choice.effects.flatMap((effect) => {
        const next = { ...effect }
        if (rule.appliedDefences?.includes('save')) delete next.save
        if (rule.appliedDefences?.includes('invulnerable-save')) delete next.invulnerable
        if (rule.appliedDefences?.includes('toughness')) delete next.toughness
        return Object.keys(next).some(
          (field) => !['role', 'phases', 'weapon', 'targetKeywords', 'excludedTargetKeywords', 'condition'].includes(field),
        )
          ? [next]
          : []
      }),
    }))
  const written = plain(/\*\*Effect:\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/i.exec(rule.description)?.[1] ?? rule.description)
  const aura = /^While a friendly (.+?) unit(?: \(excluding .+?\))? is within (\d+)" of (?:this model|the bearer), (.+)$/i.exec(written)
  const selectedAlly =
    /^Each time this model destroys an enemy unit, select one other friendly .+? unit within (\d+)" of (?:this model|it)\. Until the end of the phase, (.+)$/i.exec(
      written,
    )
  const text = aura?.[3] ?? selectedAlly?.[2] ?? written
  const range = aura && rule.scope === 'nearby' ? `Within ${aura[2]}"` : ''
  const phases = rule.phases?.length ? rule.phases : both
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
      return selected.choices.map((choice) => ({
        ...choice,
        label: `After ${rule.source} destroys a unit · Within ${selectedAlly[1]}"${choice.label === 'Active' ? '' : ` · ${choice.label}`}`,
      }))
  }

  const conditionalGrant =
    /^Each time a model in that unit makes an attack, if that model has the (.+?) keyword or that enemy unit is the closest eligible target, that attack has the \[([^\]]+)\] ability\.?$/i.exec(
      text,
    )
  if (conditionalGrant && supportedKeyword(conditionalGrant[2]!)) {
    const hasKeyword = rule.keywords?.some((keyword) => key(keyword) === key(conditionalGrant[1]!))
    return [
      {
        label: [range, hasKeyword ? '' : 'Closest eligible target'].filter(Boolean).join(' · ') || 'Active',
        effects: [attack({ keyword: conditionalGrant[2]! })],
      },
    ]
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

const supportedKeyword = (keyword: string) =>
  /^(?:lethal hits|devastating wounds|ignores cover|twin-linked|lance|sustained hits [1-9])$/i.test(keyword)

/** A recipient must be granted an effect; proximity that only protects the source is not an aura. */
export function combatRuleRecipient(description: string) {
  return (
    /While a friendly ([\s\S]+?) is within \d+["“”] of (?:this model|the bearer),/i.exec(description)?.[1] ??
    /select (?:one|a) (?:other )?friendly ([\s\S]+?) within \d+["“”]/i.exec(description)?.[1] ??
    /weapons equipped by friendly ([^.,]+?) models/i.exec(description)?.[1] ??
    (/each time an attack targets either your [^,]+? unit, or a unit that is not [\s\S]+?visible to the attacking model because of/i.test(
      description,
    )
      ? 'a unit'
      : undefined)
  )
}

export function combatRuleRoles(description: string): CombatRuleEffect['role'][] {
  const text = plain((/\*\*Effect:\*\*\s*([\s\S]*?)(?=\n\n\*\*|$)/i.exec(description)?.[1] ?? description).split(/\*{0,3}Example:/i)[0]!)
  const offensiveTarget = /select [^.]*enemy|enemy unit hit by|that targets (?:a|an|the closest|your .+? target)/i.test(text)
  const attackingText = text.replace(/(?:until|after|just after) (?:an enemy|the attacking) unit [^.]*?(?:attacks|fought|shot), /gi, '')
  const attacking =
    /(?:a model (?:in|with)|this model|the bearer|this unit)[^.;]*?makes? (?:a ranged |a melee |a |an )attack|weapons? equipped|(?:this|that|your) unit(?:'s)?[^.;]*?(?:attacks?[^.;]*?have|weapons? have)|critical hit|lethal hits|sustained hits|devastating wounds|ignores cover|twin-linked|\+[1-9]\s*A\b/i.test(
      attackingText,
    )
  const incoming = text.replace(/(?:a model|this model|the bearer|this unit)[^.;]*?makes? (?:a ranged |a melee |a |an )attack[^,.;]*/gi, '')
  const defending =
    /(?:attack|attacks) (?:that )?(?:targets?|is allocated to) (?:(?:this|that|your) (?:unit|model)|the bearer|a model)|saving throw|invulnerable|feel no pain|(?:has|have|add|improve)[^.;]*?(?:toughness|save characteristic|wounds characteristic)|damage characteristic of (?:that|the) attack|stealth|benefit of cover/i.test(
      incoming,
    )
  const enemyWeapons = /(?:weapons? equipped by|attacks? made by) (?:models in )?(?:that enemy|enemy|the attacking) unit/i.test(text)
  const attacker = (offensiveTarget && (attacking || defending || /mortal wounds/i.test(text))) || (attacking && !enemyWeapons)
  const defender = enemyWeapons || (defending && !offensiveTarget)
  return [...(attacker ? ['attacker' as const] : []), ...(defender ? ['defender' as const] : [])]
}

export function combatRuleIsRelevant(rule: CombatRule) {
  const compiled = compileCombatRule(rule)
  return compiled ? compiled.choices.some((choice) => choice.effects.length) : combatRuleRoles(rule.description).length > 0
}

export function combatEffectAppliesTo(effect: CombatRuleEffect, role: CombatRuleEffect['role'], opposingKeywords?: readonly string[]) {
  return effect.role === role && (opposingKeywords === undefined || matchesEffectTarget(effect, opposingKeywords))
}

export function combatRuleAppliesTo(rule: CombatRule, role: CombatRuleEffect['role'], opposingKeywords?: readonly string[]) {
  const compiled = compileCombatRule({ ...rule, included: false })
  if (compiled)
    return compiled.choices.some((choice) => choice.effects.some((effect) => combatEffectAppliesTo(effect, role, opposingKeywords)))
  const choices = combatRuleChoices({ ...rule, included: false })
  return choices.length
    ? choices.some((choice) => choice.effects.some((effect) => combatEffectAppliesTo(effect, role, opposingKeywords)))
    : combatRuleRoles(rule.description).includes(role)
}

export function combatRuleDefault(rule: CombatRule) {
  if (rule.included) return 0
  const compiled = compileCombatRule(rule)
  if (compiled) return compiled.defaultChoice
  if (!combatRuleChoices(rule).length) return 0
  const text = plain(rule.description)
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
      const profileKind = datasheetProfileKind(profile.type)
      const phase = profileKind === 'ranged-weapon' ? 'ranged' : profileKind === 'melee-weapon' ? 'melee' : null
      if (!phase) return profile
      let values = profile.values
      const adjustments = new Map<
        DatasheetCharacteristicKind,
        { positive: number; negative: number; exclusive: number; sources: string[] }
      >()
      for (const { rule, role: effectRole, keywords } of scoped)
        for (const effect of rule.effects) {
          if (
            effect.role !== effectRole ||
            !effect.phases.includes(phase) ||
            effect.condition ||
            !matchesEffectTarget(effect, keywords) ||
            (effect.weapon && key(effect.weapon) !== key(profile.name))
          )
            continue
          if (effect.characteristic) {
            const modifier = effect.characteristic
            const original = profile.values.find((value) => datasheetCharacteristicKind(value.name) === modifier.kind)
            if (effectRole !== role || !original?.modifiers?.includes(rule.name)) {
              const adjustment = adjustments.get(modifier.kind) ?? { positive: 0, negative: 0, exclusive: 0, sources: [] }
              if (modifier.nonCumulative) adjustment.exclusive = Math.min(adjustment.exclusive, modifier.add)
              else if (modifier.add < 0) adjustment.negative += modifier.add
              else adjustment.positive += modifier.add
              adjustment.sources.push(rule.name)
              adjustments.set(modifier.kind, adjustment)
            }
          }
          if (effect.keyword) {
            const keyword = effect.keyword
            const existing = values.find((value) => datasheetCharacteristicKind(value.name) === 'keywords')
            const held = existing?.value.split(/[,;]/).map((value) => value.trim()) ?? []
            const numbered = /^(sustained hits) (\d+)$/i.exec(keyword)
            if (held.some((value) => key(value) === key(keyword))) continue
            if (numbered) {
              const previous = held.find((value) => key(value).startsWith(`${key(numbered[1]!)} `))
              if (previous && Number(/(\d+)$/.exec(previous)?.[1]) >= Number(numbered[2])) continue
              if (previous) held.splice(held.indexOf(previous), 1)
            }
            const next = {
              name: existing?.name ?? 'Keywords',
              value: [...held.filter((value) => !/^[-—]$/.test(value)), keyword].filter(Boolean).join(', '),
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
        let adjusted: string
        if ((kind === 'attacks' || kind === 'damage') && !/^\d+$/.test(value.value)) {
          const dice = diceExpression(value.value)
          if (!dice || !dice.dice || dice.bonus + add < 0) return value
          const bonus = dice.bonus + add
          adjusted = `${dice.dice === 1 ? '' : dice.dice}D${dice.sides}${bonus ? `+${bonus}` : ''}`
        } else {
          if (!/^-?\d+\+?$/.test(value.value)) return value
          const next = Number(value.value.replace('+', '')) + add
          const bounded =
            kind === 'armour-penetration'
              ? Math.min(0, next)
              : kind === 'ballistic-skill' || kind === 'weapon-skill'
                ? Math.max(2, Math.min(6, next))
                : Math.max(1, next)
          adjusted = `${bounded}${value.value.endsWith('+') ? '+' : ''}`
        }
        return {
          ...value,
          value: adjusted,
          baseValue: value.baseValue ?? value.value,
          modifiers: [...new Set([...(value.modifiers ?? []), ...adjustment.sources])],
        }
      })
      return { ...profile, values }
    }),
  }
}

export function combatRuleOptions(
  rules: readonly ActiveCombatRule[],
  role: CombatRuleEffect['role'],
  phase: Phase,
): Partial<CombatOptions> {
  const result: Partial<CombatOptions> = {}
  const rank = { none: 0, ones: 1, failed: 2 }
  for (const rule of rules)
    for (const effect of rule.effects) {
      if (
        effect.role !== role ||
        !effect.phases.includes(phase) ||
        !effect.options ||
        effect.condition ||
        effect.weapon ||
        effect.targetKeywords ||
        effect.excludedTargetKeywords
      )
        continue
      if (effect.options.cover) result.cover = true
      for (const field of ['hitModifier', 'woundModifier'] as const) result[field] = (result[field] ?? 0) + (effect.options[field] ?? 0)
      result.positiveWoundModifier = (result.positiveWoundModifier ?? 0) + Math.max(0, effect.options.woundModifier ?? 0)
      result.psychicHitModifier = (result.psychicHitModifier ?? 0) + Math.max(0, effect.options.hitModifier ?? 0)
      for (const field of ['hitReroll', 'woundReroll'] as const) {
        const next = effect.options[field]
        if (next && rank[next] > rank[result[field] ?? 'none']) result[field] = next
      }
    }
  return result
}

export function combatRuleDefences(target: CombatInput['target'], rules: readonly ActiveCombatRule[], phase: Phase): CombatInput['target'] {
  const effects = rules.flatMap((rule) => rule.effects).filter((effect) => effect.role === 'defender' && effect.phases.includes(phase))
  return {
    ...target,
    invulnerable: effects.reduce(
      (roll, effect) => (effect.invulnerable === undefined ? roll : Math.min(roll ?? 7, effect.invulnerable)),
      target.invulnerable,
    ),
    save: effects.reduce((roll, effect) => (effect.save === undefined ? roll : Math.min(roll, effect.save)), target.save),
    toughness: Math.max(1, target.toughness + effects.reduce((total, effect) => total + (effect.toughness ?? 0), 0)),
    damageDivisor: effects.reduce((divisor, effect) => Math.max(divisor, effect.damageDivisor ?? 1), target.damageDivisor ?? 1),
    feelNoPain: effects.reduce(
      (roll, effect) => (effect.feelNoPain === undefined ? roll : Math.min(roll ?? 7, effect.feelNoPain)),
      target.feelNoPain,
    ),
    psychicFeelNoPain: effects.reduce(
      (roll, effect) => (effect.psychicFeelNoPain === undefined ? roll : Math.min(roll ?? 7, effect.psychicFeelNoPain)),
      target.psychicFeelNoPain,
    ),
    mortalFeelNoPain: effects.reduce(
      (roll, effect) => (effect.mortalFeelNoPain === undefined ? roll : Math.min(roll ?? 7, effect.mortalFeelNoPain)),
      target.mortalFeelNoPain,
    ),
    damageReduction: [...new Map(rules.map((rule) => [rule.name, rule])).values()].reduce(
      (amount, rule) =>
        amount +
        Math.max(
          0,
          ...rule.effects
            .filter((effect) => effect.role === 'defender' && effect.phases.includes(phase))
            .map((effect) => effect.damageReduction ?? 0),
        ),
      target.damageReduction ?? 0,
    ),
  }
}

function matchesEffectTarget(effect: CombatRuleEffect, keywords: readonly string[]) {
  const held = new Set(keywords.map(key))
  const matches = (phrase: string) => held.has(key(phrase))
  return (!effect.targetKeywords || effect.targetKeywords.some(matches)) && !effect.excludedTargetKeywords?.some(matches)
}

export function combatRuleMortals(
  rules: readonly ActiveCombatRule[],
  phase: Phase,
  targetKeywords: readonly string[],
  weapons: readonly { profile: { name: string } }[],
  models: number,
) {
  return [...new Map(rules.map((rule) => [rule.name, rule])).values()].flatMap((rule) =>
    rule.effects.flatMap((effect) =>
      effect.role === 'attacker' &&
      effect.phases.includes(phase) &&
      matchesEffectTarget(effect, targetKeywords) &&
      (!effect.weapon || weapons.some(({ profile }) => key(profile.name) === key(effect.weapon!))) &&
      effect.mortalWounds
        ? [{ ...effect.mortalWounds, rolls: effect.mortalWounds.perModel ? models : effect.mortalWounds.rolls }]
        : [],
    ),
  )
}

export function combatRuleWeapons(
  used: readonly { weapon: CombatWeapon | null; count: number; profile: { name: string } }[],
  rules: readonly ActiveCombatRule[],
  role: CombatRuleEffect['role'],
  phase: Phase,
  targetKeywords: readonly string[],
): CombatWeapon[] {
  const rank = { none: 0, ones: 1, failed: 2 }
  return used.flatMap(({ weapon, count, profile }) => {
    if (!weapon) return []
    const next = { ...weapon, count }
    for (const rule of rules)
      for (const effect of rule.effects) {
        if (
          effect.role !== role ||
          !effect.phases.includes(phase) ||
          !matchesEffectTarget(effect, targetKeywords) ||
          (effect.weapon && key(effect.weapon) !== key(profile.name))
        )
          continue
        if (effect.damageReroll) next.damageReroll = effect.damageReroll
        for (const field of ['criticalHit', 'criticalWound'] as const) {
          const threshold = effect[field]
          const requires = field === 'criticalHit' ? 'criticalHitRequiresSuccess' : 'criticalWoundRequiresSuccess'
          const destination = effect[requires] ? (field === 'criticalHit' ? 'successfulCriticalHit' : 'successfulCriticalWound') : field
          if (threshold !== undefined) next[destination] = Math.min(next[destination] ?? 6, threshold)
        }
        for (const field of ['ignoreHitModifiers', 'ignoreWoundModifiers', 'ignoreSkillModifiers'] as const)
          if (effect[field]) next[field] = true
        if (effect.allHitsCritical) next.allHitsCritical = true
        if (effect.condition === 'critical-wound' && effect.characteristic?.kind === 'armour-penetration')
          next.criticalAp = (next.criticalAp ?? 0) + (effect.characteristic.add ?? 0)
        if (effect.condition === 'stronger')
          next.strongerWoundModifier = (next.strongerWoundModifier ?? 0) + (effect.options?.woundModifier ?? 0)
        if (effect.condition === 'double-strength')
          next.doubleStrengthWoundModifier = (next.doubleStrengthWoundModifier ?? 0) + (effect.options?.woundModifier ?? 0)
        if (effect.condition || (!effect.weapon && !effect.targetKeywords && !effect.excludedTargetKeywords)) continue
        for (const field of ['hitModifier', 'woundModifier'] as const) next[field] = (next[field] ?? 0) + (effect.options?.[field] ?? 0)
        next.positiveHitModifier = (next.positiveHitModifier ?? 0) + Math.max(0, effect.options?.hitModifier ?? 0)
        next.positiveWoundModifier = (next.positiveWoundModifier ?? 0) + Math.max(0, effect.options?.woundModifier ?? 0)
        for (const field of ['hitReroll', 'woundReroll'] as const) {
          const value = effect.options?.[field]
          if (value && rank[value] > rank[next[field] ?? 'none']) next[field] = value
        }
      }
    return [next]
  })
}
