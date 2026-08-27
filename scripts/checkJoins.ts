import path from 'node:path'
import { routeSlug } from '../src/core/slug'
import { isReferenceDatasheet, loadCatalogue } from '../src/server/catalogueIndex'
import { isMatchedPlayDatasheet } from '../src/server/cataloguePicker'
import { catalogueFactionName } from '../src/server/factionNames'
import { datacardJoinReport } from '../src/server/datasheetJoin'
import { loadRules, rulesFaction } from '../src/server/rules'

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
const rules = loadRules(
  path.join(directory, 'rules'),
  path.join(directory, 'battlemaster'),
  path.join(directory, 'faction-icons'),
  path.join(directory, 'datacards', '11th', 'gdc'),
  loaded.datacards,
)
if (!rules) throw new Error('rules data is unavailable')
const datacardsOnlyDetachments = new Set(
  [...loaded.datacards.constructionDetachments.values()].flatMap((candidates) =>
    candidates.flatMap((candidate) => {
      const faction = routeSlug(catalogueFactionName(candidate.faction))
      const details = rules.detachmentDetails.get(rulesFaction(rules, faction))
      return [...(details?.values() ?? [])].some((detail) => routeSlug(detail.name) === routeSlug(candidate.name))
        ? []
        : [`${candidate.faction} | ${candidate.name}`]
    }),
  ),
)
const rulesOnlyDetachments = rules.constructionJoinIssues.filter((issue) => issue.kind === 'detachment')
const rulesOnlyEnhancements = rules.constructionJoinIssues.filter((issue) => issue.kind === 'enhancement')
console.log(`rules detachments without exact Game Datacards construction numbers: ${rulesOnlyDetachments.length}`)
console.log(`rules enhancements without exact Game Datacards points: ${rulesOnlyEnhancements.length}`)
console.log(`Game Datacards detachments without rules semantics: ${datacardsOnlyDetachments.size}`)
if (process.argv.includes('--details')) {
  for (const entry of report.catalogueOnly) console.log(`  catalogue only | ${entry.faction} | ${entry.name}`)
  for (const entry of report.datacardsOnly) console.log(`  cards only     | ${entry.faction} | ${entry.name}`)
  for (const issue of rulesOnlyDetachments) console.log(`  rules only     | ${issue.faction} | ${issue.detachment}`)
  for (const issue of rulesOnlyEnhancements) {
    console.log(`  rules only     | ${issue.faction} | ${issue.detachment} | ${issue.enhancement}`)
  }
  for (const issue of datacardsOnlyDetachments) console.log(`  cards only     | ${issue}`)
}

/*
 * A ratchet, so these only ever come down. At the pinned snapshot the catalogue names
 * ten datasheets the cards do not (each god's Soul Grinder against the cards' one, and
 * the Tyranid units another unit spawns) and the cards file twenty-one where the
 * catalogue does not (Space Marine heroes the cards keep in the Adeptus Astartes file
 * and the catalogue in their chapters' books, and Sir Hekhtur).
 */
if (report.catalogueOnly.length > 10 || report.datacardsOnly.length > 21) {
  throw new Error('datasheet name agreement fell below the pinned catalogue baseline')
}
if (rulesOnlyDetachments.length > 30 || rulesOnlyEnhancements.length > 95 || datacardsOnlyDetachments.size > 12) {
  throw new Error('army-construction name agreement fell below the pinned catalogue baseline')
}
