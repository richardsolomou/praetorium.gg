import type { CombatInput, CombatPhase } from './combat'
import { combatSchema } from './combat'
import type { CombatAttacker } from './combatScenario'
import { combatTarget } from './combatProfiles'
import type { CombatCarrier } from './combatLoadout'
import {
  combatRuleDefences,
  combatRuleProjected,
  effectModels,
  withBearerEffects,
  type ActiveCombatRule,
  type CombatRuleEffect,
} from './combatRules'
import { datasheetCharacteristicKind } from './datasheetStructure'

export type CombatMember = Omit<CombatAttacker, 'companions'> & {
  startingModels?: number
  damage?: number
  allocationRequired?: boolean
  bodyguard?: boolean
  /** The members whose shared defences the roster already counts in this member's characteristics. */
  appliedDefenceSources?: readonly string[]
  companions?: readonly CombatMember[]
}

export function combatUnitSequenceError(unit: CombatMember, groups?: CombatInput['target']['groups']) {
  const members = [unit, ...(unit.companions ?? [])]
  if (members.length < 2) return undefined
  const named = (source: string) => members.filter((member) => member.sheet.name === source).length
  const last = (groups ?? combatUnitTarget(unit).target?.groups)?.at(-1)?.unit
  if (members.some((member) => member.appliedDefenceSources?.some((source) => source !== last || named(source) !== 1)))
    return 'Combined attacks cannot yet remove a shared defensive ability already counted in a characteristic when its source is destroyed. Use the phase estimates.'
  if (
    members.some((member) =>
      member.rules?.some(
        (rule) =>
          rule.source !== undefined &&
          rule.source !== member.sheet.name &&
          named(rule.source) > 1 &&
          rule.effects.some((effect) => effect.role === 'defender'),
      ),
    )
  )
    return 'Combined attacks cannot tell which of two units with the same name shares a defensive ability. Use the phase estimates.'
  return undefined
}

/** The Feel No Pain other members give a group, leaving out grants limited to models with a keyword the group lacks. */
function grantedFeelNoPain(grants: readonly { unit: string; value: number; models?: string }[], keywords: readonly string[]) {
  const reaching = grants.filter((grant) => !grant.models || keywords.includes(grant.models))
  return reaching.length ? { feelNoPainSources: reaching.map(({ unit, value }) => ({ unit, value })) } : {}
}

export function combatUnitKeywords(unit: CombatAttacker) {
  return [...new Set([unit, ...(unit.companions ?? [])].flatMap((member) => member.sheet.keywords))]
}

export function combatUnitTarget(defender: CombatMember, phase?: CombatPhase, attackRules: readonly ActiveCombatRule[] = []) {
  const unit = withBearerEffects(defender)
  const members = [unit, ...(unit.companions ?? [])] as readonly CombatMember[]
  if (members.some((member) => member.allocationRequired))
    return { target: null, labels: [], error: "Choose the defender's surviving models." }
  const built = members.map((member) => {
    let ambiguous = false
    const grants = member.sheet.abilities.flatMap((ability) => {
      if (ability.kind !== 'core' || !ability.source) return []
      const value = /^Feel No Pain ([2-6])\+$/i.exec(ability.name)?.[1]
      if (!value) return []
      const owners = members.filter((source) => source !== member && source.sheet.abilities.some((rule) => rule.name === ability.source))
      if (owners.length > 1 || owners.some((owner) => members.filter((candidate) => candidate.sheet.name === owner.sheet.name).length > 1))
        ambiguous = true
      return owners.map((source) => ({ id: ability.id, unit: source.sheet.name, value: Number(value), models: ability.models }))
    })
    const sheet = grants.length
      ? { ...member.sheet, abilities: member.sheet.abilities.filter((ability) => !grants.some((grant) => grant.id === ability.id)) }
      : member.sheet
    const limited = limitedDefences(member)
    const splitKeywords = [...grants.flatMap((grant) => (grant.models ? [grant.models] : [])), ...limited.marks.keys()]
    const printed = combatTarget(sheet, member.models, member.startingModels, limited.carriers, splitKeywords)
    const reaches = (effect: CombatRuleEffect, group: number) => {
      const mark = limited.effects.get(effect)
      return !mark || Boolean(printed.keywords[group]?.includes(mark))
    }
    return {
      ...printed,
      // A profile whose models defend apart names the rules that set them apart.
      labels: printed.labels.map((label, at) => {
        const marks = printed.keywords[at]!.flatMap((keyword) => limited.marks.get(keyword) ?? [])
        return marks.length && printed.labels.filter((other) => other === label).length > 1 ? `${label} · ${marks.join(' · ')}` : label
      }),
      error: ambiguous ? 'The source of a shared Feel No Pain ability could not be identified.' : printed.error,
      grants,
      target: printed.target && phase ? combatRuleDefences(printed.target, limited.rules, phase, attackRules, reaches) : printed.target,
    }
  })
  const error = built.find((part) => part.error)?.error
  if (error) return { target: null, labels: [], error }
  if (members.length === 1) return built[0]!
  const groups = built.flatMap((part, index) =>
    part.target!.groups.map((group, at) => ({
      ...group,
      bodyguard: members[index]!.bodyguard ?? index === 0,
      character: members[index]!.sheet.keywords.some((keyword) => keyword.toLowerCase() === 'character'),
      damage: at === 0 ? (members[index]!.damage ?? 0) : 0,
      // A group's own defences, as those of the models an effect limited to some reaches, stand over its member's.
      feelNoPain: group.feelNoPain !== undefined ? group.feelNoPain : part.target!.feelNoPain,
      psychicFeelNoPain: (group.psychicFeelNoPain !== undefined ? group.psychicFeelNoPain : part.target!.psychicFeelNoPain) ?? null,
      mortalFeelNoPain: (group.mortalFeelNoPain !== undefined ? group.mortalFeelNoPain : part.target!.mortalFeelNoPain) ?? null,
      unit: members[index]!.sheet.name,
      ...grantedFeelNoPain(part.grants, part.keywords[at] ?? []),
      damageReduction: group.damageReduction ?? part.target!.damageReduction ?? 0,
      damageDivisor: group.damageDivisor ?? part.target!.damageDivisor ?? 1,
    })),
  )
  const target: CombatInput['target'] = { groups, feelNoPain: null }
  const parsed = combatSchema.shape.target.safeParse(target)
  return parsed.success
    ? {
        target: parsed.data,
        labels: built.flatMap((part, index) =>
          part.labels.map((label) => (label === members[index]!.sheet.name ? label : `${members[index]!.sheet.name} · ${label}`)),
        ),
        error: null,
      }
    : { target: null, labels: [], error: 'This attached unit exceeds the supported model or defence-group limit.' }
}

/**
 * A member's defending effects that reach only some of its models, as a wargear's bearer's or some models' by keyword:
 * each marks the carriers it reaches, a carrier only some of whose models hold it splits in two, an effect reaching every
 * model is one of the unit's and one reaching none is left out.
 */
/** The defences an allocation group holds for itself; an effect limited to some models changing others stays the unit's. */
const GROUP_DEFENCES = [
  'invulnerable',
  'save',
  'improveSave',
  'toughness',
  'wounds',
  'feelNoPain',
  'psychicFeelNoPain',
  'mortalFeelNoPain',
  'damageReduction',
  'damageDivisor',
] as const satisfies readonly (keyof CombatRuleEffect)[]

function limitedDefences(member: CombatMember) {
  const marks = new Map<string, string>()
  const effects = new Map<CombatRuleEffect, string>()
  let carriers: readonly CombatCarrier[] = member.carriers
  const fielded = member.carriers.filter((carrier) => carrier.models > 0 && !carrier.unitWide)
  const rules = withoutProjectedWounds(member).map((rule) => ({
    ...rule,
    effects: rule.effects.flatMap((effect) => {
      const models =
        effect.role === 'defender' &&
        (GROUP_DEFENCES.some((field) => effect[field] !== undefined) ||
          effect.unitStat?.kind === 'toughness' ||
          effect.unitStat?.kind === 'wounds')
          ? effectModels(effect, rule, member)
          : undefined
      if (!models) return [effect]
      const reached = fielded.length ? fielded.map(models) : [models({ name: member.sheet.name, models: 1, weapons: [] }) ? 1 : 0]
      if (reached.every((count) => !count)) return []
      if (!fielded.length || reached.every((count, at) => count === fielded[at]!.models)) return [effect]
      // Effects limited alike, as a wargear's invulnerable save and Feel No Pain, mark the same models once.
      const bearer = effect.bearerOnly ? rule.heldBy : undefined
      const mark = `\u0000${JSON.stringify([effect.modelKeywords, effect.excludedModelKeywords, bearer])}`
      effects.set(effect, mark)
      if (marks.has(mark)) return [effect]
      marks.set(mark, rule.name)
      carriers = carriers.flatMap((carrier) => {
        const count = carrier.models > 0 && !carrier.unitWide ? Math.min(carrier.models, models(carrier)) : 0
        const marked = { ...carrier, keywords: [...(carrier.keywords ?? []), mark] }
        if (!count) return [carrier]
        if (count === carrier.models) return [marked]
        // Which of the models hold another wargear is not known: the rest hold it first, so no model counts twice.
        const rest = carrier.models - count
        const holders = (part: number, start: number) =>
          carrier.abilities && {
            abilities: Object.fromEntries(
              Object.entries(carrier.abilities).map(([id, held]) => [
                id,
                id === bearer ? (start ? part : 0) : Math.max(0, Math.min(part, held - start)),
              ]),
            ),
          }
        return [
          { ...marked, models: count, ...holders(count, rest) },
          { ...carrier, models: rest, ...holders(rest, 0) },
        ]
      })
      return [effect]
    }),
  }))
  return { rules, carriers, marks, effects }
}

/** A member's rules without the Wounds changes the catalogue already counts in its models' Wounds characteristic. */
function withoutProjectedWounds(member: CombatMember): readonly ActiveCombatRule[] {
  const modifiers = member.sheet.profiles.flatMap((profile) =>
    profile.values.flatMap((value) => (datasheetCharacteristicKind(value.name) === 'wounds' ? (value.modifiers ?? []) : [])),
  )
  return (member.rules ?? []).map((rule) =>
    combatRuleProjected(rule, modifiers)
      ? {
          ...rule,
          effects: rule.effects.flatMap((effect) => {
            const { wounds: _wounds, unitStat, ...rest } = effect
            if (effect.wounds === undefined && unitStat?.kind !== 'wounds') return [effect]
            const kept = unitStat && unitStat.kind !== 'wounds' ? { ...rest, unitStat } : rest
            return Object.keys(kept).some((field) => field !== 'role' && field !== 'phases' && field !== 'bearerOnly') ? [kept] : []
          }),
        }
      : rule,
  )
}
