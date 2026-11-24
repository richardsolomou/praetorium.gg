import fs from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { completeSteps } from '../src/shared/steps'
import type { VsDataUnits } from '../src/shared/vsData'
import { abilitySummaryIn } from '../src/shared/vsDataAbilities'

const directory = process.env.CATALOGUE_DIR ?? 'catalogue-data'

/** A rule only BSData prints finds its VS Data summary however VS Data names it, through the aliases VS Data gives it. */
describe.skipIf(!fs.existsSync(directory))('a VS Data ability by its aliases', () => {
  let units: VsDataUnits

  beforeAll(() => {
    units = completeSteps(vsDataSummariesSteps(directory, []))!.unitsIn(null)
  }, 180_000)

  it('finds a detachment upgrade VS Data names with its "(Upgrade)" suffix', () =>
    expect(abilitySummaryIn(units, '@adepta-sororitas.sacred-champions', 'Writ of Compunction')).not.toBeNull())

  it('finds a detachment rule VS Data keeps under another name and aliases by the name the detachment prints', () =>
    expect(abilitySummaryIn(units, '@imperial-knights.questor-forgepact', 'Mechanicus Allies')).not.toBeNull())

  it('finds an ability VS Data aliases to its BSData profile on a datasheet it has no unit for', () =>
    expect(abilitySummaryIn(units, 'c19c-2ff4-3765-b37f', 'Malus Codicium', '3aa6-2e1e-cf55-6803')).not.toBeNull())
})
