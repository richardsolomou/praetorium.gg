import fs from 'node:fs'
import path from 'node:path'
import { hash } from 'node:crypto'
import { catalogueEditionLoaders } from '../../src/server/catalogueEditions'
import { referenceCatalogue } from '../../src/server/canonicalCatalogue'
import { readCatalogueComposition } from '../../src/server/catalogueComposition'
import { editionCatalogueId } from '../../src/core/catalogueEdition'
import {
  catalogueRuntimeFingerprint,
  runtimeManifestSchema,
  MAX_RUNTIME_FILE_BYTES,
  type RuntimeConstruction,
} from '../../src/server/catalogueRuntime'
import { loadSnapshot } from './catalogueSnapshotLoad'
import { replaceDirectory } from '../../src/server/replaceDirectory'
import { remember } from '../../src/core/collections'
import type { ConstructionSummaries } from '../../src/shared/pickerUnits'

export function writeCatalogueRuntime(directory: string, output: string) {
  const { catalogue, rules } = loadSnapshot(directory)
  const versions = catalogueEditionLoaders(
    directory,
    () => catalogue,
    () => rules,
    null,
  )
  const canonical = versions.canonicalCatalogue(
    referenceCatalogue(
      directory,
      () => catalogue,
      () => rules,
    ),
  )
  if (!canonical) throw new Error('Runtime reference is unavailable')
  const positions = <T>(records: T[]) => new Map(records.map((record, index) => [record, index]))
  const datasheets = positions(canonical.datasheets)
  const detachments = positions(canonical.detachments)
  const issues = positions(canonical.issues)
  const indexes = <T>(records: T[], offsets: Map<T, number>) =>
    records.map((record) => {
      const index = offsets.get(record)
      if (index === undefined) throw new Error('Runtime reference is missing an edition record')
      return index
    })
  const staging = fs.mkdtempSync(`${output}.`)
  const files: Record<string, { sha256: string; bytes: number }> = {}
  const write = (key: string, value: unknown) => {
    const content = JSON.stringify(value)
    const bytes = Buffer.byteLength(content)
    if (bytes > MAX_RUNTIME_FILE_BYTES) throw new Error(`Runtime catalogue ${key} is too large`)
    files[key] = { sha256: hash('sha256', content), bytes }
    fs.writeFileSync(path.join(staging, `${key}.json`), content)
  }
  try {
    write('startup', {
      baseCatalogueIds: [...catalogue.index.catalogues.keys()],
      factions: versions.factions(),
      canonical,
      searchIndex: versions.searchIndex(),
      combatUnits: versions.combatUnits(),
    })
    write('construction', constructionTable(versions.constructionSummaries()))
    for (const { edition } of readCatalogueComposition(directory)?.editions ?? []) {
      const id = editionCatalogueId(edition.id, edition.catalogueIds[0]!)
      const selected = versions.canonicalFor(id)!
      write(`${edition.id}.canonical`, {
        ...selected,
        datasheets: indexes(selected.datasheets, datasheets),
        detachments: indexes(selected.detachments, detachments),
        issues: indexes(selected.issues, issues),
      })
    }
    fs.writeFileSync(
      path.join(staging, 'manifest.json'),
      JSON.stringify(
        runtimeManifestSchema.parse({
          format: 'praetorium.catalogue-runtime.v2',
          fingerprint: catalogueRuntimeFingerprint(directory),
          files,
        }),
      ),
    )
    replaceDirectory(staging, output)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

/** A book's reference list and picker, and each rules version of it, mostly hold the same rows, so each is written once. */
function constructionTable(summaries: Map<string, ConstructionSummaries>) {
  const table: RuntimeConstruction = { rows: [], books: {} }
  const offsets = new Map<string, number>()
  const indexes = (rows: RuntimeConstruction['rows']) =>
    rows.map((row) => remember(offsets, JSON.stringify(row), () => table.rows.push(row) - 1))
  for (const [id, { cards, picker }] of summaries) table.books[id] = { cards: indexes(cards), picker: indexes(picker) }
  return table
}
