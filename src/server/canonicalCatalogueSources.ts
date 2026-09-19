import type { SnapshotSourceName } from './catalogueSources'

export const CANONICAL_CATALOGUE_SOURCE_NAMES = ['definitions', 'rules', 'datacards'] as const satisfies readonly SnapshotSourceName[]

export const canCompileCanonicalCatalogue = (disabled: ReadonlySet<SnapshotSourceName>) =>
  CANONICAL_CATALOGUE_SOURCE_NAMES.every((source) => !disabled.has(source))
