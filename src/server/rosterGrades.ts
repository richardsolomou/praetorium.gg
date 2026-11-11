import type { PriceInput } from '../contracts/schemas'
import { REFERENCE_ATTACKERS, gradedTargets, rosterGrades } from '../core/rosterGrades'
import { measureRosterUnits, unitTotal, type GradeReferences, type ReferenceUnit } from '../shared/rosterGradeMeasures'
import { app } from './app'
import { combatCalculationPool } from './combatCalculationPool'
import { namedCombatant } from './combatTools'
import { serverWords } from './publishedTextFiles'
import { memoUntilSnapshotChanges } from './snapshotMemo'

// The pool refuses work beyond 64 pending calculations and shares two workers with the simulator, so grading asks a few at a time.
const BATCH = 4

// Reference units are shared reference data, never a reader's roster, so one build serves every request.
const referenceUnit = (key: string, unit: { faction: string; unit: string; models?: number }) =>
  memoUntilSnapshotChanges('roster-grade-reference', key, async (): Promise<ReferenceUnit | null> => {
    const snapshot = await namedCombatant(unit.faction, unit.unit, unit.models)
    return snapshot && { snapshot, wounds: unitTotal(snapshot, 'wounds') }
  })

async function references(limit: number): Promise<GradeReferences> {
  const [targets, attackers] = await Promise.all([
    Promise.all(gradedTargets(limit).map(async (target) => [target.key, await referenceUnit(target.key, target)] as const)),
    Promise.all(REFERENCE_ATTACKERS.map((attacker) => referenceUnit(attacker.key, attacker))),
  ])
  return {
    targets: Object.fromEntries(targets.filter(([, unit]) => unit)),
    attackers: attackers.filter((unit) => unit !== null),
  }
}

/** The grades for a roster's current picks, from the exact simulator at full strength with passive rules only. */
export async function calculateRosterGrades(data: PriceInput, signal: AbortSignal) {
  const instance = app()
  const [loaded, rules] = await Promise.all([instance.catalogueFor(data.catalogueId), instance.rulesFor(data.catalogueId)])
  if (!loaded) throw new Error('This roster’s army data is unavailable.')
  const units = await measureRosterUnits({
    loaded,
    rules,
    data,
    words: await serverWords(),
    references: await references(data.limit),
    // A busy or failed calculation service fails the whole request, so the reader can retry rather than read a gap.
    calculate: async (requests) => {
      const answers = []
      for (let start = 0; start < requests.length; start += BATCH)
        answers.push(
          ...(await Promise.all(requests.slice(start, start + BATCH).map((request) => combatCalculationPool.calculate(request, signal)))),
        )
      return answers
    },
  })
  return rosterGrades(units, data.limit)
}
