import path from 'node:path'
import { baselineShortfall } from './baselines'
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
  return Boolean(entry && isMatchedPlayDatasheet(loaded.index, entry) && isReferenceDatasheet(loaded, catalogueId, entryId))
})
console.log(`catalogue datasheets without a card in their faction's file: ${report.catalogueOnly.length}`)
console.log(`cards without a catalogue datasheet in their book: ${report.datacardsOnly.length}`)
console.log(`datasheet joins using an exact reference: ${report.exact}`)
console.log(`datasheet joins using a name fallback: ${report.fallbacks.length}`)
const rules = loadRules(
  path.join(directory, 'rules'),
  path.join(directory, 'battlemaster'),
  path.join(directory, 'faction-icons'),
  path.join(directory, 'datacards', '11th', 'gdc'),
  loaded.datacards,
  loaded.sourceReferences,
)
if (!rules) throw new Error('rules data is unavailable')
const datacardsOnlyDetachments = new Set(
  [...loaded.datacards.constructionDetachments.values()].flatMap((candidates) =>
    candidates.flatMap((candidate) => (hasDetachmentSemantics(rules, candidate) ? [] : [`${candidate.faction} | ${candidate.name}`])),
  ),
)
const rulesOnlyDetachments = rules.constructionJoinIssues.filter((issue) => issue.kind === 'detachment')
const rulesOnlyEnhancements = rules.constructionJoinIssues.filter((issue) => issue.kind === 'enhancement')
const constructionDetails = [...rules.detachmentDetails].flatMap(([faction, detachments]) =>
  [...detachments.values()].map((detachment) => ({ faction, detachment })),
)
const invalidDetachments = constructionDetails.filter(
  ({ detachment }) => detachment.points === null || detachment.dispositions.length !== 1,
)
const invalidEnhancements = constructionDetails.flatMap(({ faction, detachment }) =>
  [...detachment.enhancements, ...detachment.upgrades]
    .filter((enhancement) => enhancement.points === null)
    .map((enhancement) => ({ faction, detachment: detachment.name, enhancement: enhancement.name })),
)
const enhancementsWithoutSemantics = constructionDetails.flatMap(({ faction, detachment }) =>
  detachment.enhancements
    .filter((enhancement) => enhancement.keywordRestrictions === null)
    .map((enhancement) => ({ faction, detachment: detachment.name, enhancement: enhancement.name })),
)
console.log(`40kdc-only detachments ignored by Game Datacards enumeration: ${rulesOnlyDetachments.length}`)
console.log(`40kdc-only enhancements ignored by Game Datacards enumeration: ${rulesOnlyEnhancements.length}`)
console.log(`Game Datacards detachments without 40kdc semantics: ${datacardsOnlyDetachments.size}`)
console.log(`Game Datacards detachments with invalid construction numbers: ${invalidDetachments.length}`)
console.log(`Game Datacards enhancements with invalid points: ${invalidEnhancements.length}`)
console.log(`Game Datacards enhancements without 40kdc eligibility semantics: ${enhancementsWithoutSemantics.length}`)
console.log(`rules joins using an exact reference: ${rules.sourceJoinExacts.length}`)
console.log(`rules joins using a name fallback: ${rules.sourceJoinFallbacks.length}`)
if (process.argv.includes('--details')) {
  for (const entry of report.catalogueOnly) console.log(`  catalogue only | ${entry.faction} | ${entry.name}`)
  for (const entry of report.datacardsOnly) console.log(`  cards only     | ${entry.faction} | ${entry.name}`)
  for (const entry of report.fallbacks) console.log(`  name fallback  | ${entry.faction} | ${entry.name}`)
  for (const issue of rulesOnlyDetachments) console.log(`  rules only     | ${issue.faction} | ${issue.detachment}`)
  for (const issue of rulesOnlyEnhancements) {
    console.log(`  rules only     | ${issue.faction} | ${issue.detachment} | ${issue.enhancement}`)
  }
  for (const issue of datacardsOnlyDetachments) console.log(`  cards only     | ${issue}`)
  for (const { faction, detachment } of invalidDetachments) console.log(`  invalid card   | ${faction} | ${detachment.name}`)
  for (const issue of invalidEnhancements) {
    console.log(`  invalid card   | ${issue.faction} | ${issue.detachment} | ${issue.enhancement}`)
  }
  for (const issue of enhancementsWithoutSemantics) {
    console.log(`  semantics gap  | ${issue.faction} | ${issue.detachment} | ${issue.enhancement}`)
  }
  for (const fallback of rules.sourceJoinFallbacks) {
    console.log(`  name fallback  | ${fallback.faction} | ${fallback.detachment}${fallback.name ? ` | ${fallback.name}` : ''}`)
  }
}

/*
 * A ratchet, so these only ever come down. At the pinned snapshot the catalogue names
 * fifteen datasheets the cards do not (each god's Soul Grinder against the cards' one,
 * the Tyranid units another unit spawns, and the four Speed Freeks buggies and the
 * Wurrboy that eleventh edition folded into Warbuggies and the Weirdboy) and the cards
 * file twenty-four where the catalogue does not (Space Marine heroes the cards keep in
 * the Adeptus Astartes file and the catalogue in their chapters' books, Sir Hekhtur, and
 * the Gunwagon, Nazdreg and Runtherd the catalogue has no datasheet for at all).
 */
if (report.catalogueOnly.length > 15 || report.datacardsOnly.length > 24) {
  baselineShortfall('datasheet name agreement fell below the pinned catalogue baseline')
}
if (rulesOnlyDetachments.length > 23 || rulesOnlyEnhancements.length > 90 || datacardsOnlyDetachments.size) {
  baselineShortfall('army-construction name agreement fell below the pinned catalogue baseline')
}
if (invalidDetachments.length || invalidEnhancements.length || enhancementsWithoutSemantics.length > 336) {
  baselineShortfall('Game Datacards construction coverage fell below the pinned catalogue baseline')
}
