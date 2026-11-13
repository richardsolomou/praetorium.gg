import fs from 'node:fs'
import path from 'node:path'
import { liveCatalogueRevision } from '../../src/server/liveCatalogue'
import { loadCatalogueHistory } from '../../src/server/catalogueHistory'
import { removedNamesOf } from '../../src/shared/importMismatch'
import { loadCatalogueTranslations } from '../../src/server/catalogueTranslations'
import { importRosterFile } from '../../src/shared/rosterFiles'
import { loadSnapshot } from './catalogueSnapshotLoad'
import { CORPUS_ROOT, type Listing } from './importCorpusSources'
import { compilerFingerprint } from './compilerSources'
import { refreshLiveCatalogue } from './liveCatalogue'
import { prepareLiveRevision } from './liveCatalogueRefresh'

/**
 * The catalogue a release would serve: production follows upstream sources past the pinned snapshot, so a list
 * can fail against the pin and import cleanly there. It follows them from the pin into a cache beside the corpus.
 */
export async function liveCorpusCatalogue(pinned: string) {
  const compiler = await compilerFingerprint()
  const root = path.join(CORPUS_ROOT, 'live', compiler)
  // The first revision is a copy of the pin, which the bootstrap reads from CATALOGUE_DIR.
  process.env.CATALOGUE_DIR = pinned
  if (!liveCatalogueRevision(root)) await refreshLiveCatalogue(root, prepareLiveRevision(root, compiler, { bootstrap: true }))
  await refreshLiveCatalogue(root, prepareLiveRevision(root, compiler))
  const live = liveCatalogueRevision(root)
  if (!live) throw new Error('No live catalogue was prepared')
  return path.join(live.directory, 'catalogue')
}

/** Every `.txt` list in a corpus directory from events in the window, imported against the catalogue in `catalogueDirectory`. */
export function importCorpusLists(directory: string, window: { since?: string; until?: string }, catalogueDirectory: string) {
  const indexFile = path.join(directory, 'index.json')
  const listed: Listing[] = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : []
  const byId = new Map(listed.map((listing) => [listing.list, listing]))
  const inWindow = (date = '') => (!window.since || date >= window.since) && (!window.until || (date !== '' && date <= window.until))
  const ids = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => name.slice(0, -4))
    .filter((id) => inWindow(byId.get(id)?.date))
  const { catalogue, rules } = loadSnapshot(catalogueDirectory)
  const translations = loadCatalogueTranslations(catalogueDirectory)
  const removed = removedNamesOf(loadCatalogueHistory(catalogueDirectory) ?? [])
  const lists = ids.map((id) => ({
    listing: byId.get(id) ?? { list: id },
    imported: importRosterFile(
      { file: fs.readFileSync(path.join(directory, `${id}.txt`), 'utf8') },
      catalogue,
      undefined,
      rules,
      translations,
      removed,
    ),
  }))
  return { catalogue, rules, lists }
}
