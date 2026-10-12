import type { RosterPick } from '../../../core/roster'
import { combatRuleSelections } from '../../../core/combatRules'
import { combatMatchup, type CombatAnswer, type CombatantSnapshot, type CombatRequest } from '../../../core/combatMatchup'
import type { CombatResult } from '../../../core/combat'
import type { combatantDatasheet } from '../../functions'
import { combatAtHealth } from '../../../core/combatSurvivors'
import type { CombatRoster } from './useCombatant'

type ProjectedCombatant = NonNullable<Awaited<ReturnType<typeof combatantDatasheet>>>
export type RosterCombatSummary = Record<
  'ranged' | 'melee' | 'combined',
  {
    result?: Pick<CombatResult, 'wipe' | 'meanDamage' | 'meanKills'>
    error?: string
  }
>
export type RosterCombatUnit = {
  rosterIndex: number
  pickIndex: number
  name: string
  snapshot: CombatantSnapshot | null
  live?: boolean
  error?: string
}

export function rosterCombatIndices(picks: readonly RosterPick[]) {
  for (const [index, pick] of picks.entries()) {
    if (
      pick.attachedTo !== undefined &&
      (!picks[pick.attachedTo] || pick.attachedTo === index || picks[pick.attachedTo]!.attachedTo !== undefined)
    )
      throw new Error('Fix the roster’s invalid attachment before comparing it.')
  }
  return picks.flatMap((pick, index) => (pick.attachedTo === undefined ? [index] : []))
}

export function rosterCombatSnapshot(
  data: ProjectedCombatant,
  picks: readonly RosterPick[],
  live?: { units: NonNullable<CombatRoster['battle']>['units']; pickIndex: number },
): CombatantSnapshot {
  const selections = combatRuleSelections([...data.rules, ...data.companions.flatMap((member) => member.rules)], {})
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
    sharedDefenceSources: selections.sharedDefenceSources(data.rules),
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
          sharedDefenceSources: selections.sharedDefenceSources(member.rules),
        }
        return live ? combatAtHealth(projected, live.units[member.pickIndex]!) : projected
      }),
  }
  return live ? combatAtHealth(snapshot, live.units[live.pickIndex]!) : snapshot
}

export function rosterCombatRequest(attacker: CombatantSnapshot | null, defender: CombatantSnapshot | null, error?: string) {
  const matchup = combatMatchup(attacker, defender, { preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] })
  const request: CombatRequest = {
    ranged: matchup.scenario('ranged', {}),
    melee: matchup.scenario('melee', {}),
    sequenceError: matchup.sequenceError,
  }
  const unavailable = Object.fromEntries(
    (['ranged', 'melee'] as const).flatMap((phase) =>
      request[phase]
        ? []
        : [
            [
              phase,
              error ??
                (attacker?.allocationRequired || attacker?.companions?.some((member) => member.allocationRequired)
                  ? "Choose the attacker's surviving models and weapons in the unit simulator."
                  : undefined) ??
                matchup.target?.error ??
                (matchup.plans[phase]?.errors.join(' ') || 'This phase could not be calculated.'),
            ],
          ],
    ),
  ) as Partial<Record<'ranged' | 'melee', string>>
  return { request, unavailable }
}

export function summarizeRosterCombat(answer: CombatAnswer, unavailable: Partial<Record<'ranged' | 'melee', string>>): RosterCombatSummary {
  const phase = (name: keyof RosterCombatSummary) => {
    const result = answer[name]?.result
    return result
      ? { result: { wipe: result.wipe, meanDamage: result.meanDamage, meanKills: result.meanKills } }
      : {
          error:
            answer[name]?.error ??
            (name === 'combined' ? 'Both phases must be supported for a combined estimate.' : unavailable[name]) ??
            'This phase could not be calculated.',
        }
  }
  return { ranged: phase('ranged'), melee: phase('melee'), combined: phase('combined') }
}
