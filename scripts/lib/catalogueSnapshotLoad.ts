import path from 'node:path'
import { remember } from '../../src/core/collections'
import { loadCatalogue } from '../../src/server/catalogueIndex'
import { loadRules } from '../../src/server/rules'

export function loadSnapshot(directory: string) {
  const catalogue = loadCatalogue(directory)
  if (!catalogue) throw new Error(`Catalogue unavailable: ${directory}`)
  return { catalogue, rules: loadRules(directory, { catalogue }) }
}

export function loadSnapshotWithRules(directory: string) {
  const { catalogue, rules } = loadSnapshot(directory)
  if (!rules) throw new Error(`Rules unavailable: ${directory}`)
  return { catalogue, rules }
}

const sharedSnapshots = new Map<string, ReturnType<typeof loadSnapshotWithRules>>()

/**
 * A snapshot loaded once per process, for the integration suites that share a test worker. Every reader must treat it
 * as read-only, as the server does the one catalogue it serves every request from.
 */
export function sharedSnapshot(directory: string) {
  const resolved = path.resolve(directory)
  return remember(sharedSnapshots, resolved, () => loadSnapshotWithRules(resolved))
}
