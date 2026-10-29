import type { CatalogueChange } from '../core/catalogueChanges'

/** A reference page by the slugs its address is built from. */
export type ReferenceLink = { kind: 'datasheet' | 'detachment'; faction: string; slug: string }

export type LinkedChange = CatalogueChange & { link: ReferenceLink | null }

/** Changes the same armies all recorded, each linked, as one block of an update's body. */
export type LinkedChangeGroup = {
  factions: { catalogueId: string; faction: string; slug: string | null }[]
  changes: LinkedChange[]
}

/** One update as the index lists it: a row that opens onto every change it recorded. */
export type IndexedUpdate = {
  /** The fragment its row is addressed by. */
  anchor: string
  recordedAt: number
  /** Its distinct changes, a change several armies share counted once. */
  total: number
  /** Whether the row starts open, which only a small update does. */
  open: boolean
  groups: LinkedChangeGroup[]
  /** Changes past the change set's bound, counted so a reader knows the list is not the whole of it. */
  omitted: number
}
