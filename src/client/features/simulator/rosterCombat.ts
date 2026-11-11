import type { RosterPick } from '../../../core/roster'
import { readableCombatant } from './readableRules'
import { combatDamageStateSelections, combatRuleSelections } from '../../../core/combatRules'
import type { CombatantSnapshot } from '../../../core/combatMatchup'
import type { combatantDatasheet } from '../../functions'
import { combatAtHealth } from '../../../core/combatSurvivors'
import type { CombatRoster } from './useCombatant'
import type { RosterOwner } from './rosterOwners'
import type { BuiltRoster } from '../../../core/battle'

type ProjectedCombatant = NonNullable<Awaited<ReturnType<typeof combatantDatasheet>>>
export type RosterCombatUnit = {
  rosterIndex: number
  pickIndex: number
  name: string
  /** Whose list the unit comes from, when a side fields more than one. */
  owner?: RosterOwner
  snapshot: CombatantSnapshot | null
  live?: boolean
  error?: string
}

/** A sealed list at full strength, starting from its first unit; null when it kept no loadouts. */
export function sealedCombatRoster(roster: { built?: Omit<BuiltRoster, 'units'> } | null | undefined): CombatRoster | null {
  const built = roster?.built
  if (!built?.picks?.length) return null
  return {
    catalogueId: built.catalogueId,
    detachmentIds: built.detachmentIds ?? [],
    disposition: built.disposition,
    limit: built.limit,
    picks: built.picks,
    pickIndex: 0,
    waivedRules: built.waivedRules ?? [],
    borrowedDetachmentId: null,
    optionalRules: [],
  }
}

export function rosterCombatSnapshot(
  combatant: ProjectedCombatant,
  picks: readonly RosterPick[],
  live?: { units: NonNullable<CombatRoster['battle']>['units']; pickIndex: number },
): CombatantSnapshot {
  const data = readableCombatant(combatant)
  const selections = combatRuleSelections(
    [...data.rules, ...data.companions.flatMap((member) => member.rules)],
    live
      ? Object.assign(
          combatDamageStateSelections(data.rules, live.units[live.pickIndex]!),
          ...data.companions.map((member) =>
            combatDamageStateSelections(member.rules, live.units[member.pickIndex] ?? { models: 0, damage: 0 }),
          ),
        )
      : {},
  )
  const snapshot: CombatantSnapshot = {
    sheet: data.selected,
    models: data.models,
    startingModels: data.models,
    damage: 0,
    bodyguard: true,
    carriers: data.carriers,
    allocationRequired: Boolean(data.attachmentErrors.length),
    rules: selections.active(data.rules),
    ruleChoices: selections.choices,
    appliedDefenceSources: selections.appliedDefenceSources(data.rules),
    companions: data.companions
      .filter((member) => !live || live.units[member.pickIndex]?.available)
      .map((member) => {
        const projected = {
          sheet: member.selected,
          models: member.models,
          startingModels: member.models,
          damage: 0,
          bodyguard: picks[member.pickIndex]?.attachedTo === undefined,
          carriers: member.carriers,
          rules: selections.active(member.rules),
          appliedDefenceSources: selections.appliedDefenceSources(member.rules),
        }
        return live ? combatAtHealth(projected, live.units[member.pickIndex]!) : projected
      }),
  }
  return live ? combatAtHealth(snapshot, live.units[live.pickIndex]!) : snapshot
}
