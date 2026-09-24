import type { CatalogueChange, FactionChanges } from '../core/catalogueChanges'

/** A reference page by the slugs its address is built from. */
export type ReferenceLink = { kind: 'datasheet' | 'detachment'; faction: string; slug: string }

export type LinkedChange = CatalogueChange & { link: ReferenceLink | null }

/** One recorded data update, whole, as its own page reads it. */
export type LinkedChangeSet = {
  /** The update's address, `/changes/<id>`. */
  id: string
  recordedAt: number
  total: number
  omitted: number
  factions: (Omit<FactionChanges, 'changes'> & {
    /** The fragment its block is addressed by on the update's page. */
    anchor: string
    slug: string | null
    changes: LinkedChange[]
  })[]
}

/** One update as the index lists it: a summary, and its changes only when it is small. */
export type IndexedUpdate = {
  id: string
  recordedAt: number
  total: number
  inline: boolean
  /** The factions it reached most, first. */
  factions: { faction: string; anchor: string; count: number }[]
  /** How many further factions it reached. */
  more: number
  changes: LinkedChangeSet | null
}
