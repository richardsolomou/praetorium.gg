import fs from 'node:fs'
import path from 'node:path'
import { nameOf } from '../src/core/catalogue'
import { legacyNamesSchema } from '../src/server/legacyNames'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'

/**
 * Adds to `catalogue/legacy-ids/` the names every rules version of a catalogue snapshot gives each datasheet and
 * Detachment, by the ID a saved roster holds: New Recruit prints these spellings, which imports read once the catalogue
 * no longer carries them. The files are append-only: a name they hold is never removed.
 *
 *   pnpm exec tsx scripts/freezeImportNames.ts <catalogue directory>
 */
const [directory] = process.argv.slice(2)
if (!directory) throw new Error('Usage: tsx scripts/freezeImportNames.ts <catalogue directory>')
const composition = readCatalogueComposition(directory)
if (!composition) throw new Error(`${directory} has no catalogue composition`)

const found = { datasheets: new Map<string, Set<string>>(), detachments: new Map<string, Set<string>>() }
const add = (section: Map<string, Set<string>>, id: string, name: string) => section.set(id, (section.get(id) ?? new Set()).add(name))
for (const entry of composition.editions) {
  const loaded = entry.base ? loadCatalogue(directory) : loadCatalogue(editionDirectory(directory, entry), entry.edition)
  if (!loaded) throw new Error(`${entry.edition.id} has no catalogue`)
  for (const faction of loaded.factions)
    for (const id of loaded.index.datasheets.get(faction.id) ?? []) {
      const definition = loaded.index.definitions.get(id)
      if (definition) add(found.datasheets, id, nameOf(definition, loaded.index.definitions))
    }
  for (const { options } of loaded.detachments.values()) for (const option of options) add(found.detachments, option.id, option.name)
}

const folder = path.join(import.meta.dirname, '../catalogue/legacy-ids')
for (const section of ['datasheets', 'detachments'] as const) {
  const file = path.join(folder, `${section.slice(0, -1)}-names.json`)
  const frozen = legacyNamesSchema.parse(
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { format: 'praetorium.legacy-names.v1', names: {} },
  )
  for (const [id, names] of found[section]) frozen.names[id] = [...new Set([...(frozen.names[id] ?? []), ...names])]
  const names = Object.fromEntries(Object.entries(frozen.names).toSorted(([left], [right]) => (left < right ? -1 : 1)))
  fs.writeFileSync(file, `${JSON.stringify({ ...frozen, names }, null, 2)}\n`)
  console.log(`${Object.keys(names).length} ${section} named`)
}
