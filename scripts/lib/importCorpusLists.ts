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

/**
 * Every `.txt` list in the corpus directories from events in the window, imported against the catalogue in
 * `catalogueDirectory`. Sources republish one another, so a list whose text another already gave is read once.
 */
export function importCorpusLists(directories: readonly string[], window: { since?: string; until?: string }, catalogueDirectory: string) {
  const inWindow = (date = '') => (!window.since || date >= window.since) && (!window.until || (date !== '' && date <= window.until))
  const seen = new Set<string>()
  const files = directories.flatMap((directory) => {
    const indexFile = path.join(directory, 'index.json')
    const listed: Listing[] = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : []
    const byId = new Map(listed.map((listing) => [listing.list, listing]))
    return fs
      .readdirSync(directory)
      .filter((name) => name.endsWith('.txt'))
      .map((name) => name.slice(0, -4))
      .filter((id) => inWindow(byId.get(id)?.date))
      .flatMap((id) => {
        const file = fs.readFileSync(path.join(directory, `${id}.txt`), 'utf8')
        const text = file.replace(/\s+/g, ' ').trim().toLowerCase()
        if (seen.has(text)) return []
        seen.add(text)
        return [{ listing: byId.get(id) ?? { list: id }, file }]
      })
  })
  const { catalogue, rules } = loadSnapshot(catalogueDirectory)
  const translations = loadCatalogueTranslations(catalogueDirectory)
  const removed = removedNamesOf(loadCatalogueHistory(catalogueDirectory) ?? [])
  const lists = files.map(({ listing, file }) => ({
    listing,
    imported: importRosterFile({ file }, catalogue, undefined, rules, translations, removed),
  }))
  return { catalogue, rules, lists }
}
