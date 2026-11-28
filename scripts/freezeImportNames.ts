import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { nameOf, resolve } from '../src/core/catalogue'
import { legacyEntryNamesSchema, legacyNamesSchema } from '../src/server/legacyNames'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { readsAsRulesSentence } from './lib/rulesSentence'

/**
 * Adds to `catalogue/legacy-ids/` the names every rules version of a catalogue snapshot gives each book, datasheet,
 * Detachment and other entry (model, wargear, upgrade, Enhancement), by the ID a saved roster or a New Recruit list holds,
 * and which entries are models: New Recruit prints these spellings, which imports read once the catalogue no longer
 * carries them. The files are append-only: a key, name or model they hold is never removed, except an entry name the
 * snapshot shows is a rules sentence (`readsAsRulesSentence`) and no profile of the entry carries, which is an instruction
 * or a notice, not a name a list prints; its key stays.
 *
 *   pnpm exec tsx scripts/freezeImportNames.ts <catalogue directory>
 */
const [directory] = process.argv.slice(2)
if (!directory) throw new Error('Usage: tsx scripts/freezeImportNames.ts <catalogue directory>')
const composition = readCatalogueComposition(directory)
if (!composition) throw new Error(`${directory} has no catalogue composition`)

// The base rules version's names are under the stored ID; an earlier version's, where they differ, under
// `<rules version>~<ID>`, as `units.json` keys them, since a list exported from that version names them so.
const SECTIONS = ['books', 'datasheets', 'detachments', 'entries'] as const
type Section = (typeof SECTIONS)[number]
const sections = () =>
  Object.fromEntries(SECTIONS.map((section) => [section, new Map<string, Set<string>>()])) as Record<Section, Map<string, Set<string>>>
const found = sections()
const models = new Set<string>()
const sentences = new Set<string>()
const add = (section: Map<string, Set<string>>, id: string, name: string) => section.set(id, (section.get(id) ?? new Set()).add(name))
const editions = composition.editions.toSorted((left, right) => Number(right.base === true) - Number(left.base === true))
for (const entry of editions) {
  const loaded = entry.base ? loadCatalogue(directory) : loadCatalogue(editionDirectory(directory, entry), entry.edition)
  if (!loaded) throw new Error(`${entry.edition.id} has no catalogue`)
  const { definitions } = loaded.index
  const named = sections()
  // A rules version's book IDs carry its prefix, which the key adds back where its names differ.
  for (const faction of loaded.factions) add(named.books, faction.id.slice(faction.id.indexOf('~') + 1), faction.name)
  for (const faction of loaded.factions)
    for (const id of loaded.index.datasheets.get(faction.id) ?? []) {
      const definition = definitions.get(id)
      if (definition) add(named.datasheets, id, nameOf(definition, definitions))
    }
  for (const { options } of loaded.detachments.values()) for (const option of options) add(named.detachments, option.id, option.name)
  // A New Recruit list names every entry by its ID; a datasheet's names are its own section's.
  for (const [id, definition] of definitions) {
    const name = nameOf(definition, definitions)
    const profiled = resolve(definition, loaded.index).profiles?.some((profile) => profile.name?.toLowerCase() === name.toLowerCase())
    if (readsAsRulesSentence(name) && !profiled) sentences.add(name)
    else if (!named.datasheets.has(id)) add(named.entries, id, name)
    // Entry IDs are the same in every rules version, so the base one says which are models.
    if (entry.base && resolve(definition, loaded.index).type === 'model') models.add(id)
  }
  for (const section of SECTIONS)
    for (const [id, names] of named[section]) {
      const base = found[section].get(id)
      const same = base && base.size === names.size && [...names].every((name) => base.has(name))
      if (entry.base) for (const name of names) add(found[section], id, name)
      else if (!same) for (const name of names) add(found[section], `${entry.edition.id}~${id}`, name)
    }
}

const folder = path.join(import.meta.dirname, '../catalogue/legacy-ids')
const sorted = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).toSorted(([left], [right]) => (left < right ? -1 : 1)))
const withAdded = (frozen: Record<string, string[]>, names: Map<string, Set<string>>) => {
  // Every name stays; the snapshot's own come last, so the newest spelling is the one a reader takes first.
  for (const [id, spelled] of names) frozen[id] = [...(frozen[id] ?? []).filter((name) => !spelled.has(name)), ...spelled]
  return sorted(frozen)
}
const write = (file: string, content: object, count: number, section: Section) => {
  fs.writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`)
  execFileSync('pnpm', ['exec', 'oxfmt', file], { stdio: 'inherit' })
  console.log(`${count} ${section} named`)
}
for (const section of ['books', 'datasheets', 'detachments'] as const) {
  const file = path.join(folder, `${section.slice(0, -1)}-names.json`)
  const frozen = legacyNamesSchema.parse(
    fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { format: 'praetorium.legacy-names.v1', names: {} },
  )
  const names = withAdded(frozen.names, found[section])
  write(file, { ...frozen, names }, Object.keys(names).length, section)
}
const file = path.join(folder, 'entry-names.json')
const frozen = legacyEntryNamesSchema.parse(
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { format: 'praetorium.legacy-entry-names.v1', names: {}, models: [] },
)
// An ID keeps its key with no names, as the maps never lose a key.
const names = withAdded(
  Object.fromEntries(Object.entries(frozen.names).map(([id, spelled]) => [id, spelled.filter((name) => !sentences.has(name))])),
  found.entries,
)
write(file, { ...frozen, names, models: [...new Set([...frozen.models, ...models])].toSorted() }, Object.keys(names).length, 'entries')
