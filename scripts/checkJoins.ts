import path from 'node:path'
import { baselineShortfall } from './lib/baselines'
import { nameOf } from '../src/core/catalogue'
import { isNonMatchedPlayName } from '../src/core/name'
import { isReferenceDatasheet, loadCatalogue } from '../src/server/catalogueIndex'
import { isMatchedPlayDatasheet } from '../src/server/cataloguePicker'
import { datacardJoinReport } from '../src/server/datasheetJoin'
import { hasDetachmentSemantics, loadRules } from '../src/server/rules'

/** Every datasheet name the catalogue and Game Datacards do not agree on. Add `--details` to list them. */
const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const loaded = loadCatalogue(directory)
if (!loaded) throw new Error('catalogue data is unavailable')

const report = datacardJoinReport(loaded, (catalogueId, entryId) => {
  const entry = loaded.index.definitions.get(entryId)
  return Boolean(
    entry &&
    (isMatchedPlayDatasheet(loaded.index, entry) || isNonMatchedPlayName(nameOf(entry, loaded.index.definitions))) &&
    isReferenceDatasheet(loaded, catalogueId, entryId),
  )
})
console.log(`catalogue datasheets without a card in their faction's file: ${report.catalogueOnly.length}`)
console.log(`cards without a catalogue datasheet in their book: ${report.datacardsOnly.length}`)
console.log(`non-matched-play datasheets without a card: ${report.nonMatchedPlayCatalogueOnly.length}`)
console.log(`faction files without an army-rule card: ${report.factionsWithoutArmyRules.length}`)
console.log(`datasheet joins by name: ${report.nameJoins.length}`)
const rules = loadRules(
  directory,
  path.join(directory, 'battlemaster'),
  path.join(directory, 'faction-icons'),
  path.join(directory, 'datacards', '11th', 'gdc'),
  loaded.datacards,
)
if (!rules) throw new Error('rules data is unavailable')
const datacardsOnlyDetachments = new Set(
  [...loaded.datacards.constructionDetachments.values()].flatMap((candidates) =>
    candidates.flatMap((candidate) => (hasDetachmentSemantics(rules, candidate) ? [] : [`${candidate.faction} | ${candidate.name}`])),
  ),
)
const stratagemIssues = [...new Set(loaded.datacards.factions.values())].flatMap((content) =>
  content.stratagemIssues.map((issue) => `${content.name} | ${issue}`),
)
const constructionDetails = [...rules.detachmentDetails].flatMap(([faction, detachments]) =>
  [...detachments.values()].map((detachment) => ({ faction, detachment })),
)
const invalidDetachments = constructionDetails.filter(
  ({ detachment }) => detachment.points === null || detachment.dispositions.length === 0,
)
const invalidEnhancements = constructionDetails.flatMap(({ faction, detachment }) =>
  [...detachment.enhancements, ...detachment.upgrades]
    .filter((enhancement) => enhancement.points === null)
    .map((enhancement) => ({ faction, detachment: detachment.name, enhancement: enhancement.name })),
)
const enhancementsWithoutSemantics = constructionDetails.flatMap(({ faction, detachment }) =>
  detachment.enhancements
    .filter((enhancement) => enhancement.eligibility === null)
    .map((enhancement) => ({ faction, detachment: detachment.name, enhancement: enhancement.name })),
)
console.log(`Game Datacards detachments without usable stratagems: ${datacardsOnlyDetachments.size}`)
console.log(`Game Datacards stratagems with invalid or conflicting mechanics: ${stratagemIssues.length}`)
console.log(`Game Datacards detachments with invalid construction numbers: ${invalidDetachments.length}`)
console.log(`Game Datacards enhancements with invalid points: ${invalidEnhancements.length}`)
console.log(`Game Datacards enhancements without structured eligibility: ${enhancementsWithoutSemantics.length}`)
if (process.argv.includes('--details')) {
  for (const entry of report.catalogueOnly) console.log(`  catalogue only | ${entry.faction} | ${entry.name}`)
  for (const entry of report.datacardsOnly) console.log(`  cards only     | ${entry.faction} | ${entry.name}`)
  for (const entry of report.nonMatchedPlayCatalogueOnly) console.log(`  non-matched    | ${entry.faction} | ${entry.name}`)
  for (const faction of report.factionsWithoutArmyRules) console.log(`  rules missing  | ${faction}`)
  for (const entry of report.nameJoins) console.log(`  joined by name | ${entry.faction} | ${entry.name}`)
  for (const issue of datacardsOnlyDetachments) console.log(`  cards only     | ${issue}`)
  for (const issue of stratagemIssues) console.log(`  invalid card   | ${issue}`)
  for (const { faction, detachment } of invalidDetachments) console.log(`  invalid card   | ${faction} | ${detachment.name}`)
  for (const issue of invalidEnhancements) {
    console.log(`  invalid card   | ${issue.faction} | ${issue.detachment} | ${issue.enhancement}`)
  }
  for (const issue of enhancementsWithoutSemantics) {
    console.log(`  semantics gap  | ${issue.faction} | ${issue.detachment} | ${issue.enhancement}`)
  }
}

if (report.catalogueOnly.length > 16 || report.datacardsOnly.length > 23) {
  baselineShortfall('datasheet name agreement fell below the pinned catalogue baseline')
}
if (report.nonMatchedPlayCatalogueOnly.length > 745 || report.factionsWithoutArmyRules.length > 1) {
  baselineShortfall('datasheet prose coverage fell below the pinned catalogue baseline')
}
if (datacardsOnlyDetachments.size > 3) {
  baselineShortfall('army-construction name agreement fell below the pinned catalogue baseline')
}
if (invalidDetachments.length || invalidEnhancements.length) {
  baselineShortfall('Game Datacards construction coverage fell below the pinned catalogue baseline')
}
if (stratagemIssues.length > 1) baselineShortfall('Game Datacards stratagem mechanics coverage fell below the pinned catalogue baseline')
