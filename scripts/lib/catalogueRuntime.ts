import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { loadCatalogue } from '../../src/server/catalogueIndex'
import { loadRules } from '../../src/server/rules'
import { catalogueEditionLoaders } from '../../src/server/catalogueEditions'
import { referenceCatalogue } from '../../src/server/canonicalCatalogue'
import { readCatalogueComposition } from '../../src/server/catalogueComposition'
import { editionCatalogueId } from '../../src/core/catalogueEdition'
import { packRuntimeData } from '../../src/contracts/runtimeData'
import { catalogueRuntimeFingerprint, runtimeManifestSchema, MAX_RUNTIME_FILE_BYTES } from '../../src/server/catalogueRuntime'

export function writeCatalogueRuntime(directory: string, output: string) {
  const catalogue = loadCatalogue(directory)
  if (!catalogue) throw new Error('Runtime catalogue is unavailable')
  const rules = loadRules(directory, undefined, undefined, undefined, catalogue.datacards)
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
  const staging = fs.mkdtempSync(`${output}.`)
  const files: Record<string, { sha256: string; bytes: number }> = {}
  const write = (key: string, value: unknown) => {
    const content = JSON.stringify(value)
    const bytes = Buffer.byteLength(content)
    if (bytes > MAX_RUNTIME_FILE_BYTES) throw new Error(`Runtime catalogue ${key} is too large`)
    files[key] = { sha256: createHash('sha256').update(content).digest('hex'), bytes }
    fs.writeFileSync(path.join(staging, `${key}.json`), content)
  }
  try {
    write('startup', {
      baseCatalogueIds: [...catalogue.index.catalogues.keys()],
      factions: versions.factions(),
      canonical,
      searchIndex: versions.searchIndex(),
      combatUnits: versions.combatUnits(),
      rules: packRuntimeData(rules),
    })
    for (const { edition } of readCatalogueComposition(directory)?.editions ?? []) {
      const id = editionCatalogueId(edition.id, edition.catalogueIds[0]!)
      write(`${edition.id}.canonical`, versions.canonicalFor(id))
    }
    fs.writeFileSync(
      path.join(staging, 'manifest.json'),
      JSON.stringify(
        runtimeManifestSchema.parse({
          format: 'praetorium.catalogue-runtime.v1',
          fingerprint: catalogueRuntimeFingerprint(directory),
          files,
        }),
      ),
    )
    const previous = `${output}.previous-${randomUUID()}`
    if (fs.existsSync(output)) fs.renameSync(output, previous)
    try {
      fs.renameSync(staging, output)
    } catch (error) {
      if (fs.existsSync(previous)) fs.renameSync(previous, output)
      throw error
    }
    fs.rmSync(previous, { recursive: true, force: true })
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}
