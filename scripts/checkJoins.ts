import path from 'node:path'
import { isReferenceDatasheet, loadCatalogue } from '../src/server/catalogueIndex'
import { isMatchedPlayDatasheet } from '../src/server/cataloguePicker'
import { datacardJoinReport } from '../src/server/datasheetJoin'

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
if (process.argv.includes('--details')) {
  for (const entry of report.catalogueOnly) console.log(`  catalogue only | ${entry.faction} | ${entry.name}`)
  for (const entry of report.datacardsOnly) console.log(`  cards only     | ${entry.faction} | ${entry.name}`)
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
