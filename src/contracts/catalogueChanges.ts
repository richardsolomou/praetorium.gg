import type { CatalogueChange, FactionChanges } from '../core/catalogueChanges'

/** A reference page by the slugs its address is built from. */
export type ReferenceLink = { kind: 'datasheet' | 'detachment'; faction: string; slug: string }

export type LinkedChange = CatalogueChange & { link: ReferenceLink | null }

/** One update's changes, each linked, grouped by faction, as its row's body draws them. */
export type LinkedChangeSet = {
  omitted: number
  factions: (Omit<FactionChanges, 'changes'> & {
    /** The fragment its block is addressed by, inside its update's row. */
    anchor: string
    slug: string | null
    changes: LinkedChange[]
  })[]
}

/** One update as the index lists it: a row that opens onto every change it recorded. */
export type IndexedUpdate = {
  /** The fragment its row is addressed by. */
  anchor: string
  recordedAt: number
  total: number
  /** Whether the row starts open, which only a small update does. */
  open: boolean
  /** The factions it reached most, first, each linking into the row. */
  factions: { faction: string; anchor: string; count: number }[]
  /** How many further factions it reached. */
  more: number
  changes: LinkedChangeSet
}
