import { loadCatalogue } from '../../src/server/catalogueIndex'
import { loadRules } from '../../src/server/rules'

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
