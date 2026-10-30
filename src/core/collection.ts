import { withEntry } from './collections'

/** A player's own count of a datasheet's physical models: everything in a collection has at least one, and a typo cannot store an absurd number. */
export const MAX_COLLECTION_MODELS = 10_000

export const MAX_COLLECTION_DATASHEETS = 5_000

/** How many other datasheets one entry's models can count as, enough for every variant of a magnetised hull. */
export const MAX_COUNTS_AS = 32

/** Owned models, how many of them are built and painted, and how many more the player wants; zero models means not owned. */
type CollectionCounts = { models: number; built: number; painted: number; wanted: number }

export type CollectionProgress = { built: number; painted: number }

/** Counts with the other datasheets the owned models also count as, which a row without links leaves out. */
export type CollectionEntry = CollectionCounts & { countsAs?: string[] }

export type CollectionImportRow = { entryId: string } & CollectionEntry

/** Painted models are built and built models are owned, so lowering one count lowers the counts it bounds rather than refusing an edit another device may have made stale. */
export function boundedProgress(models: number, progress: CollectionProgress): CollectionProgress {
  const built = Math.min(progress.built, models)
  return { built, painted: Math.min(progress.painted, built) }
}

/** Owned datasheets and every datasheet their models also count as; the player declares those links, Praetorium never infers them. */
export function usableDatasheets(owned: Iterable<string>, countsAs: Readonly<Record<string, readonly string[]>>) {
  const usable = new Set<string>()
  for (const entryId of owned) {
    usable.add(entryId)
    for (const other of countsAs[entryId] ?? []) usable.add(other)
  }
  return usable
}

/** A datasheet's links without itself or repeats, in a stable order so equal choices compare equal. */
export function countsAsList(entryId: string, countsAs: readonly string[]) {
  return [...new Set(countsAs)].filter((id) => id !== entryId).toSorted()
}

/** The saved built and painted counts after one datasheet's change; nothing built keeps no entry. */
export const withProgress = (
  saved: Readonly<Record<string, CollectionProgress>>,
  { entryId, built, painted }: { entryId: string } & CollectionProgress,
) => withEntry(saved, entryId, built ? { built, painted } : undefined)

/** The saved counts-as links after one datasheet's change; no links keeps no entry. */
export function withCountsAs(
  saved: Readonly<Record<string, string[]>>,
  { entryId, countsAs }: { entryId: string; countsAs: readonly string[] },
) {
  const links = countsAsList(entryId, countsAs)
  return withEntry(saved, entryId, links.length ? links : undefined)
}

/** The saved wishes after one datasheet's change; wanting none keeps no entry. */
export const withWanted = (saved: Readonly<Record<string, number>>, { entryId, wanted }: { entryId: string; wanted: number }) =>
  withEntry(saved, entryId, wanted || undefined)

type CollectionFaction = { catalogueId: string; name: string; units: readonly { id: string; slug: string; name: string }[] }

export function collectionDatasheets(factions: readonly CollectionFaction[]) {
  const sheets = new Map<string, { id: string; catalogueId: string; faction: string; slug: string; name: string }>()
  for (const faction of factions)
    for (const unit of faction.units)
      if (!sheets.has(unit.id)) sheets.set(unit.id, { ...unit, catalogueId: faction.catalogueId, faction: faction.name })
  return sheets
}

export function groupCollection(
  entries: readonly {
    entryId: string
    models: number
    built?: number
    painted?: number
    photoIds?: string[]
    photoShows?: Record<string, string>
  }[],
  factions: readonly CollectionFaction[],
) {
  const sheets = collectionDatasheets(factions)
  const groups = new Map<
    string | null,
    {
      catalogueId: string | null
      name: string
      models: number
      entries: {
        entryId: string
        slug: string | null
        name: string
        models: number
        built?: number
        painted?: number
        photoIds?: string[]
        /** The datasheet each photo of another build shows, by photo id. */
        photoShows?: Record<string, { entryId: string; name: string }>
      }[]
    }
  >()
  for (const entry of entries) {
    const sheet = sheets.get(entry.entryId)
    const id = sheet?.catalogueId ?? null
    const group = groups.get(id) ?? { catalogueId: id, name: sheet?.faction ?? 'Earlier rules', models: 0, entries: [] }
    group.models += entry.models
    const { photoShows, ...rest } = entry
    group.entries.push({
      ...rest,
      slug: sheet?.slug ?? null,
      name: sheet?.name ?? 'A datasheet from earlier rules',
      ...(photoShows && {
        photoShows: Object.fromEntries(
          Object.entries(photoShows).map(([photoId, shown]) => [
            photoId,
            { entryId: shown, name: sheets.get(shown)?.name ?? 'A datasheet from earlier rules' },
          ]),
        ),
      }),
    })
    groups.set(id, group)
  }
  return [...groups.values()]
    .map((group) => ({ ...group, entries: group.entries.toSorted((a, b) => a.name.localeCompare(b.name)) }))
    .toSorted((a, b) => a.name.localeCompare(b.name))
}

export type CollectionGroup = ReturnType<typeof groupCollection>[number]
