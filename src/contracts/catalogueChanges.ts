import type { CatalogueChange, FactionChanges } from '../core/catalogueChanges'

/** A reference page by the slugs its address is built from. */
export type ReferenceLink = { kind: 'datasheet' | 'detachment'; faction: string; slug: string }

export type LinkedChange = CatalogueChange & { link: ReferenceLink | null }

/** One recorded data update as the changes page reads it. */
export type LinkedChangeSet = {
  recordedAt: number
  omitted: number
  factions: (Omit<FactionChanges, 'changes'> & { slug: string | null; changes: LinkedChange[] })[]
}
