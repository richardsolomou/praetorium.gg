import fs from 'node:fs'
import path from 'node:path'
import { datasheetIn } from '../src/server/catalogue'
import { datasheetsOf, loadCatalogue } from '../src/server/catalogueIndex'

const output = process.argv[2]
if (!output) throw new Error('usage: projectCatalogueProfiles.ts <output.json>')

const directory = process.env.CATALOGUE_DIR ?? path.resolve('catalogue-data')
const loaded = loadCatalogue(directory)
if (!loaded) throw new Error('catalogue data is unavailable')

const datasheets = loaded.factions.flatMap((faction) =>
  [...datasheetsOf(loaded.index, faction.id)].flatMap((entryId) => {
    const sheet = datasheetIn(loaded, faction.id, entryId)
    return sheet ? [{ catalogueId: faction.id, id: entryId, faction: faction.name, name: sheet.name, profiles: sheet.profiles }] : []
  }),
)
const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))
fs.writeFileSync(output, JSON.stringify({ revisions, datasheets }))
console.log(`projected datasheets: ${datasheets.length}`)
