import type { CombatInput, CombatOptions } from './combat'
import { combatSchema } from './combat'
import type { CombatAttacker } from './combatScenario'
import { combatTarget } from './combatProfiles'
import { combatRuleDefences, type ActiveCombatRule } from './combatRules'

export type CombatMember = Omit<CombatAttacker, 'companions'> & {
  startingModels?: number
  damage?: number
  allocationRequired?: boolean
  bodyguard?: boolean
  sharedDefenceSources?: readonly string[]
  companions?: readonly CombatMember[]
}

export function combatUnitSequenceError(unit: CombatMember, groups?: CombatInput['target']['groups']) {
  const members = [unit, ...(unit.companions ?? [])]
  const sources = members.flatMap((member) => member.sharedDefenceSources ?? [])
  const last = (groups ?? combatUnitTarget(unit).target?.groups)?.at(-1)?.unit
  return unit.companions?.length &&
    sources.some((source) => source !== last || members.filter((member) => member.sheet.name === source).length !== 1)
    ? 'Combined attacks cannot yet remove a shared defensive ability when its source is destroyed. Use the phase estimates.'
    : undefined
}

export function combatUnitKeywords(unit: CombatAttacker) {
  return [...new Set([unit, ...(unit.companions ?? [])].flatMap((member) => member.sheet.keywords))]
}

export function combatUnitTarget(unit: CombatMember, phase?: CombatOptions['phase'], attackRules: readonly ActiveCombatRule[] = []) {
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
      return owners.map((source) => ({ id: ability.id, unit: source.sheet.name, value: Number(value) }))
    })
    const sheet = grants.length
      ? { ...member.sheet, abilities: member.sheet.abilities.filter((ability) => !grants.some((grant) => grant.id === ability.id)) }
      : member.sheet
    const printed = combatTarget(sheet, member.models, member.startingModels, member.carriers)
    return {
      ...printed,
      error: ambiguous ? 'The source of a shared Feel No Pain ability could not be identified.' : printed.error,
      grants,
      target: printed.target && phase ? combatRuleDefences(printed.target, member.rules ?? [], phase, attackRules) : printed.target,
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
      feelNoPain: part.target!.feelNoPain,
      psychicFeelNoPain: part.target!.psychicFeelNoPain ?? null,
      mortalFeelNoPain: part.target!.mortalFeelNoPain ?? null,
      unit: members[index]!.sheet.name,
      ...(part.grants.length ? { feelNoPainSources: part.grants.map(({ unit: source, value }) => ({ unit: source, value })) } : {}),
      damageReduction: part.target!.damageReduction ?? 0,
      damageDivisor: part.target!.damageDivisor ?? 1,
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
