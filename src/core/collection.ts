/** A player's own count of a datasheet's physical models: everything in a collection has at least one, and a typo cannot store an absurd number. */
export const MAX_COLLECTION_MODELS = 10_000

export const MAX_COLLECTION_DATASHEETS = 5_000

type CollectionFaction = { catalogueId: string; name: string; units: readonly { id: string; slug: string; name: string }[] }

export function collectionDatasheets(factions: readonly CollectionFaction[]) {
  const sheets = new Map<string, { id: string; catalogueId: string; faction: string; slug: string; name: string }>()
  for (const faction of factions)
    for (const unit of faction.units)
      if (!sheets.has(unit.id)) sheets.set(unit.id, { ...unit, catalogueId: faction.catalogueId, faction: faction.name })
  return sheets
}

export function groupCollection(entries: readonly { entryId: string; models: number }[], factions: readonly CollectionFaction[]) {
  const sheets = collectionDatasheets(factions)
  const groups = new Map<
    string | null,
    {
      catalogueId: string | null
      name: string
      models: number
      entries: { entryId: string; slug: string | null; name: string; models: number }[]
    }
  >()
  for (const entry of entries) {
    const sheet = sheets.get(entry.entryId)
    const id = sheet?.catalogueId ?? null
    const group = groups.get(id) ?? { catalogueId: id, name: sheet?.faction ?? 'Earlier rules', models: 0, entries: [] }
    group.models += entry.models
    group.entries.push({ ...entry, slug: sheet?.slug ?? null, name: sheet?.name ?? 'A datasheet from earlier rules' })
    groups.set(id, group)
  }
  return [...groups.values()]
    .map((group) => ({ ...group, entries: group.entries.toSorted((a, b) => a.name.localeCompare(b.name)) }))
    .toSorted((a, b) => a.name.localeCompare(b.name))
}

export type CollectionGroup = ReturnType<typeof groupCollection>[number]
