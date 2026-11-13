import type { PriceInput } from '../contracts/schemas'
import { rosterGrades } from '../core/rosterGrades'
import { gradeReferences, measureRosterUnits, referenceUnit } from '../shared/rosterGradeMeasures'
import { app } from './app'
import { combatCalculationPool } from './combatCalculationPool'
import { namedCombatant } from './combatTools'
import { serverWords } from './publishedTextFiles'
import { memoUntilSnapshotChanges } from './snapshotMemo'

// The pool refuses work beyond 64 pending calculations and shares two workers with the simulator, so grading asks a few at a time.
const BATCH = 4

// Reference units are shared reference data, never a reader's roster, so one build serves every request.
const references = (limit: number) =>
  gradeReferences(limit, (key, unit) => memoUntilSnapshotChanges('roster-grade-reference', key, () => referenceUnit(unit, namedCombatant)))

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
  // An older rules version's catalogue is the same book behind a prefix.
  const book =
    loaded.index.catalogues.get(data.catalogueId) ?? loaded.index.catalogues.get(data.catalogueId.slice(data.catalogueId.indexOf('~') + 1))
  return rosterGrades(units, data.limit, book?.name ?? '')
}
