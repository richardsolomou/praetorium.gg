import { attachmentHost } from './attachedUnits'
import { COMBAT_PHASES, type CombatPhase, type CombatResult } from './combat'
import { combatMatchup, noExclusions, type CombatAnswer, type CombatantSnapshot } from './combatMatchup'
import type { RosterPick } from './roster'

export type CombatMetric = 'meanDamage' | 'meanKills' | 'uncappedDamage' | 'uncappedKills' | 'wipe'
export type RosterCombatSummary = Record<CombatPhase | 'combined', { result?: Pick<CombatResult, CombatMetric>; error?: string }>

/** The units a roster fields in a comparison: each pick that is not attached to another, with its attached units. */
export function rosterCombatIndices(picks: readonly RosterPick[]) {
  for (const [index, pick] of picks.entries()) {
    if (pick.attachedTo !== undefined && (!picks[pick.attachedTo] || picks[attachmentHost(picks, index)]!.attachedTo !== undefined))
      throw new Error('Fix the roster’s invalid attachment before comparing it.')
  }
  return picks.flatMap((pick, index) => (pick.attachedTo === undefined ? [index] : []))
}

/** One pairing's request in default conditions, with why each phase it cannot request is unavailable. */
export function rosterCombatRequest(
  attacker: CombatantSnapshot | null,
  defender: CombatantSnapshot | null,
  error?: string,
  preferences: Readonly<Record<string, string>> = {},
) {
  const matchup = combatMatchup(attacker, defender, { preferences, excluded: noExclusions(), allocation: [] })
  const request = matchup.request({})
  const unavailable = Object.fromEntries(
    COMBAT_PHASES.flatMap((phase) =>
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
  ) as Partial<Record<CombatPhase, string>>
  return { request, unavailable }
}

export function summarizeRosterCombat(answer: CombatAnswer, unavailable: Partial<Record<CombatPhase, string>>): RosterCombatSummary {
  const phase = (name: keyof RosterCombatSummary) => {
    const result = answer[name]?.result
    return result
      ? {
          result: {
            wipe: result.wipe,
            meanDamage: result.meanDamage,
            meanKills: result.meanKills,
            uncappedKills: result.uncappedKills,
            uncappedDamage: result.uncappedDamage,
          },
        }
      : {
          error:
            answer[name]?.error ??
            (name === 'combined' ? 'Both phases must be supported for a combined estimate.' : unavailable[name]) ??
            'This phase could not be calculated.',
        }
  }
  return { ranged: phase('ranged'), melee: phase('melee'), combined: phase('combined') }
}

/** The calculated pairings with the largest result, or none while any of them is unfinished, since it might be larger. */
export function bestRosterMatches(results: (RosterCombatSummary[keyof RosterCombatSummary] | undefined)[], metric: CombatMetric) {
  if (results.some((answer) => !answer)) return []
  const best = Math.max(0, ...results.map((answer) => answer?.result?.[metric] ?? 0))
  return best > 0 ? results.flatMap((answer, index) => (answer?.result?.[metric] === best ? [index] : [])) : []
}
