import fs from 'node:fs'
import path from 'node:path'
import { vsDataTextFacts } from '../src/server/vsDataEffects'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

const directory = path.resolve(catalogueDataDirectory())
const edition = process.argv[2]!
const entry = readCatalogueComposition(directory)!.editions.find((candidate) => candidate.edition.id === edition)!
const folder = entry.base ? directory : editionDirectory(directory, entry)
const catalogue = entry.base ? loadSnapshot(directory).catalogue : loadCatalogue(folder, entry.edition)!
const overlay = vsDataTextFacts(directory, edition, path.join(folder, 'datacards', '11th', 'gdc'), catalogue.definitions!, catalogue.index.datasheets)!
const out: unknown[] = []
const by: Record<string, number> = {}
for (const key of catalogue.definitions!.facts().keys()) {
  const join = overlay.join(key)
  by[join.by] = (by[join.by] ?? 0) + 1
  if (join.by === 'name' || join.by === 'ambiguous')
    out.push({ key, ...join, holders: (catalogue.definitions!.holders?.(key) ?? []).map((h) => ({ id: h.id, name: h.name, within: h.within, catalogue: h.catalogue })) })
}
fs.writeFileSync(`/private/tmp/claude-501/probe2/joins-${edition}.json`, JSON.stringify(out))
console.log(edition, JSON.stringify(by))
