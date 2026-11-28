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
  /** The keyword a unit gains when the player selects it, as Halo Override; only selected units have the army's pick. */
  selected?: string
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
export type BattleChoiceAllowance = {
  options: string
  /** The rules it widens, by name, where they were matched without their words; otherwise those whose text names its options. */
  rules?: string[]
} & ({ limit: number } | { extra: number } | { also: string })
/** An allowance as one text states it, `leading` where it holds only while the unit leads another. */
export type StatedAllowance = BattleChoiceAllowance & { leading?: true }

/** Whether a rule's words name the options an allowance widens, as "Orders". */
export const namesAllowedOptions = (allowance: BattleChoiceAllowance, words: string) =>
  new RegExp(`\\b${allowance.options}\\b`, 'i').test(normalizeCombatText(words))

/** The allowances these texts state for the unit's choices; a leader's only while `attached`. */
export const allowancesWhile = (stated: readonly StatedAllowance[], attached: boolean): BattleChoiceAllowance[] =>
  stated.flatMap(({ leading, ...allowance }) => (leading && !attached ? [] : [allowance]))

type Effect = ActiveCombatRule['effects'][number]
const unconditional = (effect: Effect) => !effect.condition && !effect.targetKeywords && !effect.excludedTargetKeywords

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
    let selected: string | undefined
    for (const choice of shown.get(rule)!) {
      armyWide ||= Boolean(choice.armyWide)
      selected ??= choice.selected
      if (!choice.option) continue
      const label = unshouted(choice.option)
      const effects = choice.effects.map((effect) => (effect.keyword ? { ...effect, keyword: unshouted(effect.keyword) } : effect))
      if (!options.has(label) || choice.label === choice.option) options.set(label, { label, effects })
    }
    const chosen = [...options.values()]
    // Options worded as conditions, as a bonus that grows if the unit charged, are the player's to check rather than to pick.
    if (chosen.length < 2 || chosen.some(({ label }) => /^If /i.test(label))) return []
    const together = activators.flatMap((activator) => {
      const labels = chosen.flatMap(({ label }) => (activator.names.includes(combatTextKey(label)) ? [label] : []))
      return labels.length > 1 ? [{ ...activator, labels }] : []
    })
    const always = together.find((activator) => activator.always)
    const allowed = allowances.filter((allowance) =>
      allowance.rules ? allowance.rules.includes(rule.name) : namesAllowedOptions(allowance, rule.description),
    )
    const limit =
      Math.max(1, ...allowed.flatMap((allowance) => ('limit' in allowance ? [allowance.limit] : []))) +
      allowed.reduce((sum, allowance) => sum + ('extra' in allowance ? allowance.extra : 0), 0)
    const also = allowed.flatMap((allowance) =>
      'also' in allowance
        ? chosen.filter(({ label }) => combatTextKey(label) === combatTextKey(allowance.also)).map(({ label }) => label)
        : [],
    )[0]
    const extent = { limit, ...(also ? { also } : {}), ...(selected ? { selected } : {}) }
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
              const set = own.reduce<number | undefined>((given, change) => ('set' in change ? change.set : given), undefined)
              const add = own.reduce((sum, change) => {
                if ('set' in change) return sum
                if (!('best' in change)) return sum + change.add
                // A Save improves only down to the best the rule allows.
                const current = Number.parseInt(value.value) + sum
                return sum - Math.max(0, Math.min(change.by, current - change.best))
              }, 0)
              return add || set !== undefined
                ? adjustedCharacteristic(
                    value,
                    add,
                    own.map((change) => change.source),
                    set,
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

type UnitChange = { kind: DatasheetCharacteristicKind; source: string } & ({ add: number } | { set: number } | { by: number; best: number })

/** The unit characteristics an effect changes, as a datasheet's stat line shows them. */
function unitChanges(effect: Effect, source: string): UnitChange[] {
  if (effect.role !== 'defender') return []
  const stat = effect.unitStat
  return [
    ...(stat?.set !== undefined ? [{ kind: stat.kind, set: stat.set, source }] : []),
    ...(stat?.add ? [{ kind: stat.kind, add: stat.add, source }] : []),
    ...(effect.toughness ? [{ kind: 'toughness' as const, add: effect.toughness, source }] : []),
    ...(effect.wounds ? [{ kind: 'wounds' as const, add: effect.wounds, source }] : []),
    ...(effect.improveSave ? [{ kind: 'save' as const, ...effect.improveSave, source }] : []),
  ]
}
