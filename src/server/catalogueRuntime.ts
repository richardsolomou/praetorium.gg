import fs from 'node:fs'
import path from 'node:path'
import { createHash, hash } from 'node:crypto'
import { z } from 'zod'
import { CANONICAL_CATALOGUE_COMPILER_VERSION } from './canonicalCatalogue'
import { parseSharedJson } from './sharedJson'
import type { CanonicalCatalogue, UnitSummary } from '../contracts/catalogue'
import type { GlobalSearchIndex } from '../core/referenceSearch'
import type { factionsFor } from '../shared/factionReferences'
import type { combatUnitsFor } from '../shared/combatUnits'
import type { ConstructionSummaries } from '../shared/pickerUnits'

export const MAX_RUNTIME_FILE_BYTES = 64 * 1024 * 1024
export const runtimeManifestSchema = z.object({
  format: z.literal('praetorium.catalogue-runtime.v2'),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  files: z
    .record(
      z.string().regex(/^(startup|construction|[a-z0-9][a-z0-9-]{0,19}\.canonical)$/),
      z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().min(1).max(MAX_RUNTIME_FILE_BYTES) }),
    )
    .refine((files) => Object.keys(files).length <= 18 && 'startup' in files && 'construction' in files),
})

export type RuntimeStartup = {
  baseCatalogueIds: string[]
  factions: ReturnType<typeof factionsFor>
  canonical: CanonicalCatalogue
  searchIndex: GlobalSearchIndex
  combatUnits: ReturnType<typeof combatUnitsFor>
}
type RuntimeKey = 'startup' | 'construction' | `${string}.canonical`
type RuntimeCanonical = Omit<CanonicalCatalogue, 'datasheets' | 'detachments' | 'issues'> & {
  datasheets: number[]
  detachments: number[]
  issues: number[]
}
/** Each book's construction summaries as indexes into one table of the distinct rows. */
export type RuntimeConstruction = { rows: UnitSummary[]; books: Record<string, Record<keyof ConstructionSummaries, number[]>> }
type RuntimeValue<K extends RuntimeKey> = K extends 'startup'
  ? RuntimeStartup
  : K extends 'construction'
    ? Map<string, ConstructionSummaries>
    : CanonicalCatalogue

export type CatalogueRuntime = {
  read: <K extends RuntimeKey>(key: K) => RuntimeValue<K>
}

export function catalogueRuntimeFingerprint(directory: string) {
  const fingerprint = createHash('sha256').update(`runtime-v5:canonical-${CANONICAL_CATALOGUE_COMPILER_VERSION}`)
  for (const file of ['revision.json', 'composition.json', 'reference-policy.json']) {
    const target = path.join(directory, file)
    fingerprint.update(file).update(fs.existsSync(target) ? fs.readFileSync(target) : 'absent')
  }
  return fingerprint.digest('hex')
}

export function readCatalogueRuntime(directory: string, output: string): CatalogueRuntime {
  const file = path.join(output, 'manifest.json')
  if (fs.statSync(file).size > 16 * 1024) throw new Error('Catalogue runtime manifest is too large')
  const manifest = runtimeManifestSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
  if (manifest.fingerprint !== catalogueRuntimeFingerprint(directory))
    throw new Error('Catalogue runtime does not match its snapshot/compiler')
  let startup: RuntimeStartup | undefined
  const read = (key: RuntimeKey): RuntimeStartup | Map<string, ConstructionSummaries> | CanonicalCatalogue => {
    const entry = manifest.files[key]
    if (!entry) throw new Error(`Catalogue runtime is missing ${key}`)
    const target = path.join(output, `${key}.json`)
    if (fs.statSync(target).size !== entry.bytes) throw new Error(`Catalogue runtime verification failed for ${key}`)
    const content = fs.readFileSync(target)
    if (content.length !== entry.bytes || hash('sha256', content) !== entry.sha256)
      throw new Error(`Catalogue runtime verification failed for ${key}`)
    const parsed = parseSharedJson(content.toString('utf8'))
    if (key === 'startup') return (startup = parsed as RuntimeStartup)
    const restore = <T>(indexes: number[], records: T[]) =>
      indexes.map((index) => {
        if (!Number.isInteger(index) || index < 0 || index >= records.length)
          throw new Error(`Catalogue runtime has an invalid index in ${key}`)
        return records[index]!
      })
    if (key === 'construction') {
      const { rows, books } = parsed as RuntimeConstruction
      return new Map(
        Object.entries(books).map(([id, { cards, picker }]) => [id, { cards: restore(cards, rows), picker: restore(picker, rows) }]),
      )
    }
    const reference = (startup ?? (read('startup') as RuntimeStartup)).canonical
    const selected = parsed as RuntimeCanonical
    return {
      ...selected,
      datasheets: restore(selected.datasheets, reference.datasheets),
      detachments: restore(selected.detachments, reference.detachments),
      issues: restore(selected.issues, reference.issues),
    }
  }
  return {
    read: <K extends RuntimeKey>(key: K): RuntimeValue<K> => read(key) as RuntimeValue<K>,
  }
}

export function productionCatalogueRuntime(directory: string) {
  if (process.env.NODE_ENV !== 'production' || process.env.VITEST) return null
  return readCatalogueRuntime(
    directory,
    process.env.CATALOGUE_LIVE_DIR
      ? path.join(path.dirname(directory), 'runtime')
      : path.resolve(process.env.LOCAL_BUILD_DIR ?? '.output', 'server/catalogue-runtime'),
  )
}
