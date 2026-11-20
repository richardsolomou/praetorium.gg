import { uniqueBy } from './collections'
import { combatTextKey, normalizeCombatText, unshouted } from './combatRuleCompiler'
import {
  type ActiveCombatRule,
  adjustedCharacteristic,
  type CombatRule,
  combatRuleDefault,
  combatRuleProfiles,
  shownRuleChoices,
} from './combatRules'
import type { Datasheet, DatasheetCharacteristicKind } from './datasheet'
import { datasheetCharacteristicKind, datasheetProfileKind } from './datasheetStructure'

/** A rule whose option a player picks during the battle, as an army's Doctrina Imperative or a unit's Battle Protocol. */
export type BattleChoice = {
  rule: CombatRule
  options: { label: string; effects: ActiveCombatRule['effects'] }[]
  /** One pick for the whole army, as a Doctrina Imperative; otherwise each unit has its own, as an Order. */
  armyWide: boolean
  /** The options another of the unit's rules always keeps active together, as Cognitive Reinforcement does, and that rule. */
  together?: { labels: string[]; source: string }
  /** How many options the unit can be in at once: one, or more where other rules allow it, as some officers and Warrior Elite do for Orders. */
  limit: number
  /** An option the unit is also in whenever it is in another, as Take Cover! is for a unit some officers lead. */
  also?: string
}

/**
 * What another of a unit's rules allows a choice it is in, named by the plural its options go by, as Orders: a higher
 * limit, as some officers give, more options on top of it, as Warrior Elite gives, or an option that comes with any other.
 */
export type BattleChoiceAllowance = { options: string } & ({ limit: number } | { extra: number } | { also: string })

const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3 }
const count = (written: string) => NUMBERS[written.toLowerCase()] ?? Number(written)

/** What these rule texts allow the unit's choices, as being affected by two Orders at once; a leader's only while `attached`. */
export function battleChoiceAllowances(texts: readonly string[], attached: boolean): BattleChoiceAllowance[] {
  return texts.flatMap((text) => {
    const written = normalizeCombatText(text)
    if (!attached && /\bis leading a unit\b/i.test(written)) return []
    const limit = /can be affected by up to (two|three|[2-9]) different (\w+) at the same time/i.exec(written)
    const extra = /select (one|two|three|[1-9]) (\w+) to affect this unit\b.*?\bin addition to any other \2s\b/i.exec(written)
    const also = /when that unit is issued an? (\w+), it is also affected by the (.+?) \1\b/i.exec(written)
    return [
      ...(limit ? [{ options: limit[2]!, limit: count(limit[1]!) }] : []),
      ...(extra ? [{ options: `${extra[2]}s`, extra: count(extra[1]!) }] : []),
      ...(also ? [{ options: `${also[1]}s`, also: also[2]! }] : []),
    ]
  })
}

type Effect = ActiveCombatRule['effects'][number]
const unconditional = (effect: Effect) => !effect.condition && !effect.targetKeywords && !effect.excludedTargetKeywords
/** What `battleChoiceSheet` draws: a weapon's ability or characteristic, or one of the unit's. */
const drawn = (effect: Effect) =>
  unconditional(effect) &&
  (unitChanges(effect, '').length > 0 ||
    Boolean(effect.ability) ||
    (effect.role === 'attacker' && Boolean(effect.keyword || effect.characteristic)))

/**
 * Each rule with two or more named options a unit can be in, every option once under its own name. An option's condition,
 * as being near a Battleline unit, is the player's to check, so each option is read without it where its words allow.
 */
export function battleChoices(rules: readonly CombatRule[], allowances: readonly BattleChoiceAllowance[] = []): BattleChoice[] {
  const shown = new Map(rules.map((rule) => [rule, shownRuleChoices(rule)]))
  // A rule that makes options of another active together: always where it is on by default, otherwise when its condition is met.
  const activators = rules.flatMap((rule) =>
    shown.get(rule)!.flatMap((choice, at) => {
      const names = choice.effects.flatMap((effect) => effect.activates ?? []).map(combatTextKey)
      return names.length ? [{ source: rule.name, names, always: combatRuleDefault(rule) === at + 1 }] : []
    }),
  )
  return uniqueBy(
    rules.filter((rule) => rule.scope !== 'stratagem'),
    (rule) => rule.name,
  ).flatMap((rule) => {
    const options = new Map<string, BattleChoice['options'][number]>()
    let armyWide = false
    for (const choice of shown.get(rule)!) {
      armyWide ||= Boolean(choice.armyWide)
      if (!choice.option) continue
      const label = unshouted(choice.option)
      const effects = choice.effects.map((effect) => (effect.keyword ? { ...effect, keyword: unshouted(effect.keyword) } : effect))
      if (!options.has(label) || choice.label === choice.option) options.set(label, { label, effects })
    }
    const chosen = [...options.values()]
    if (chosen.length < 2 || !chosen.some((option) => option.effects.some(drawn))) return []
    const together = activators.flatMap((activator) => {
      const labels = chosen.flatMap(({ label }) => (activator.names.includes(combatTextKey(label)) ? [label] : []))
      return labels.length > 1 ? [{ ...activator, labels }] : []
    })
    const always = together.find((activator) => activator.always)
    const allowed = allowances.filter((allowance) =>
      new RegExp(`\\b${allowance.options}\\b`, 'i').test(normalizeCombatText(rule.description)),
    )
    const limit =
      Math.max(1, ...allowed.flatMap((allowance) => ('limit' in allowance ? [allowance.limit] : []))) +
      allowed.reduce((sum, allowance) => sum + ('extra' in allowance ? allowance.extra : 0), 0)
    const also = allowed.flatMap((allowance) =>
      'also' in allowance
        ? chosen.filter(({ label }) => combatTextKey(label) === combatTextKey(allowance.also)).map(({ label }) => label)
        : [],
    )[0]
    const extent = { limit, ...(also ? { also } : {}) }
    if (always) return [{ rule, options: chosen, armyWide, ...extent, together: { labels: always.labels, source: always.source } }]
    const offered = together.map(({ labels, source }) => ({
      label: togetherLabel({ labels, source }),
      effects: battleChoiceEffects(chosen, labels),
    }))
    return [{ rule, options: [...chosen, ...offered], armyWide, ...extent }]
  })
}

/** How options another rule makes active together read, as "Both · Cognitive Reinforcement". */
export const togetherLabel = ({ labels, source }: NonNullable<BattleChoice['together']>) =>
  `${labels.length === 2 ? 'Both' : 'All'} · ${source}`

const battleChoiceEffects = (options: BattleChoice['options'], labels: readonly string[]) =>
  options.flatMap((option) => (labels.includes(option.label) ? option.effects : []))

/** The effects a unit has from a choice, given the options the player picked. */
export function battleChoiceActive({ options, together, limit, also }: BattleChoice, picked: readonly string[]) {
  if (together) return battleChoiceEffects(options, together.labels)
  const kept = picked.slice(-limit)
  const labels = also && kept.length && !kept.includes(also) ? [...kept, also] : kept
  return labels.length ? battleChoiceEffects(options, labels) : undefined
}

/** The datasheet as the chosen options leave it: weapon abilities and characteristics, the unit's own, and abilities it gains. */
export function battleChoiceSheet(sheet: Datasheet, active: readonly ActiveCombatRule[]): Datasheet {
  const changes = active.flatMap((rule) => rule.effects.flatMap((effect) => (unconditional(effect) ? unitChanges(effect, rule.name) : [])))
  const armed = withGainedAbilities(combatRuleProfiles(sheet, active, 'attacker'), active)
  if (!changes.length) return armed
  return {
    ...armed,
    profiles: armed.profiles.map((profile) =>
      datasheetProfileKind(profile.type) === 'unit'
        ? {
            ...profile,
            values: profile.values.map((value) => {
              const kind = datasheetCharacteristicKind(value.name)
              const own = changes.filter((change) => change.kind === kind)
              if (!own.length) return value
              const add = own.reduce((sum, change) => {
                if (!('best' in change)) return sum + change.add
                // A Save improves only down to the best the rule allows.
                const current = Number.parseInt(value.value) + sum
                return sum - Math.max(0, Math.min(change.by, current - change.best))
              }, 0)
              return add
                ? adjustedCharacteristic(
                    value,
                    add,
                    own.map((change) => change.source),
                  )
                : value
            }),
          }
        : profile,
    ),
  }
}

function withGainedAbilities(sheet: Datasheet, active: readonly ActiveCombatRule[]): Datasheet {
  const has = new Set(sheet.abilities.map(({ name }) => name.toLowerCase()))
  const gained = uniqueBy(
    active.flatMap((rule) =>
      rule.effects.flatMap((effect) =>
        effect.ability && unconditional(effect) && !has.has(effect.ability.toLowerCase())
          ? [
              {
                id: `granted:${rule.name}:${effect.ability}`,
                name: effect.ability,
                source: rule.name,
                description: null,
                kind: 'core' as const,
              },
            ]
          : [],
      ),
    ),
    ({ name }) => name.toLowerCase(),
  )
  return gained.length ? { ...sheet, abilities: [...sheet.abilities, ...gained] } : sheet
}

type UnitChange = { kind: DatasheetCharacteristicKind; source: string } & ({ add: number } | { by: number; best: number })

/** The unit characteristics an effect changes, as a datasheet's stat line shows them. */
function unitChanges(effect: Effect, source: string): UnitChange[] {
  if (effect.role !== 'defender') return []
  return [
    ...(effect.toughness ? [{ kind: 'toughness' as const, add: effect.toughness, source }] : []),
    ...(effect.improveSave ? [{ kind: 'save' as const, ...effect.improveSave, source }] : []),
    ...(effect.unitStat ? [{ ...effect.unitStat, source }] : []),
  ]
}
