// One-off: whether the client's units alias each detachment-granted ability's BSData profile to its record. Ids only.
import path from 'node:path'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { completeSteps } from '../src/shared/steps'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshotWithRules } from './lib/catalogueSnapshotLoad'

const directory = path.resolve(catalogueDataDirectory())
const { rules } = loadSnapshotWithRules(directory)
const read = completeSteps(vsDataSummariesSteps(directory, rules.ruleDocuments))!
const units = read.recordsIn(null)!
for (const rule of ['brazen-fury', 'condemnatory-psalms', 'daemonic-illusions', 'mortal-sorcery', 'baffling-data-screed']) {
  const records = Object.values(units.abilities).filter((record) => record.endsWith(`.${rule}`))
  const aliases = Object.entries(units.aliases).filter(([, record]) => record.endsWith(`.${rule}`)).map(([key, record]) => `${key} -> ${record}`)
  console.log(rule, JSON.stringify({ records: [...new Set(records)], aliases }))
}
