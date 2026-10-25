import path from 'node:path'
import { loadCatalogue } from '../../src/server/catalogueIndex'
import { catalogueEditionLoaders } from '../../src/server/catalogueEditions'
import { readCatalogueRuntime } from '../../src/server/catalogueRuntime'
import { loadRules } from '../../src/server/rules'
import type { LoadedRules } from '../../src/shared/rules'
import { catalogueDataDirectory } from './catalogueFiles'

export function loadSnapshot(directory: string) {
  const catalogue = loadCatalogue(directory)
  if (!catalogue) throw new Error(`Catalogue unavailable: ${directory}`)
  return { catalogue, rules: loadRules(directory, { loadedDatacards: catalogue.datacards }) }
}

export function loadSnapshotWithRules(directory: string) {
  const { catalogue, rules } = loadSnapshot(directory)
  if (!rules) throw new Error(`Rules unavailable: ${directory}`)
  return { catalogue, rules }
}

/** Loads the base catalogue lazily so runtime mode measures only what the compiled runtime reads. */
export function benchmarkEditions(usage: string) {
  const mode = process.argv[2]
  if (mode !== 'source' && mode !== 'runtime') throw new Error(usage)
  const gc = global.gc
  if (!gc) throw new Error('Run with --expose-gc so measurements follow garbage collection')
  const directory = path.resolve(process.argv[3] ?? catalogueDataDirectory())
  const runtime =
    mode === 'runtime' ? readCatalogueRuntime(directory, path.resolve(process.argv[4] ?? '.output/server/catalogue-runtime')) : null
  let catalogue: ReturnType<typeof loadCatalogue> | undefined
  let rules: LoadedRules | null | undefined
  const base = () => (catalogue ??= loadCatalogue(directory))
  const baseRules = () => (rules ??= loadRules(directory, { loadedDatacards: base()?.datacards }))
  return { gc, mode, directory, runtime, base, baseRules, versions: catalogueEditionLoaders(directory, base, baseRules, runtime) }
}
