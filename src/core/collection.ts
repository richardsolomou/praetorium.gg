import { z } from 'zod'

export const MAX_COLLECTION_MODELS = 10_000

export const MAX_COLLECTION_DATASHEETS = 5_000

export const DEFAULT_COLLECTION_PUBLISHED = true

export const collectionBuildSchema = z.object({
  entryId: z.string().min(1).max(128),
  equipment: z.string().trim().max(200),
})

export const collectionModelGroupSchema = z
  .object({
    models: z.number().int().min(1).max(MAX_COLLECTION_MODELS),
    state: z.enum(['fixed', 'unbuilt', 'interchangeable']),
    builds: z.array(collectionBuildSchema).min(1).max(20),
  })
  .refine((group) => group.state !== 'fixed' || group.builds.length === 1, 'A fixed build has one configuration.')
  .refine(
    (group) => new Set(group.builds.map((build) => JSON.stringify(build))).size === group.builds.length,
    'Remove duplicate configurations.',
  )

export const collectionGroupsSchema = z
  .array(collectionModelGroupSchema)
  .min(1)
  .max(50)
  .refine((groups) => groups.reduce((sum, group) => sum + group.models, 0) <= MAX_COLLECTION_MODELS, 'Too many physical models.')

export const collectionGroupsInputSchema = z
  .object({
    entryId: z.string().min(1).max(128),
    groups: collectionGroupsSchema.nullable(),
    expectedModels: z.number().int().min(1).max(MAX_COLLECTION_MODELS),
    expectedGroups: collectionGroupsSchema.nullable(),
  })
  .refine(
    (input) => !input.groups || input.groups.every((group) => group.builds.some((build) => build.entryId === input.entryId)),
    'Each group must support the datasheet it is stored under.',
  )

export type CollectionModelGroup = z.infer<typeof collectionModelGroupSchema>
export type CollectionEntry = { entryId: string; models: number; groups?: CollectionModelGroup[] }

export function physicalCollectionCounts(entries: readonly CollectionEntry[]) {
  return Object.fromEntries(entries.map((entry) => [entry.entryId, entry.models]))
}

/** Availability for each datasheet overlaps when the same models support alternative builds. */
export function collectionAvailability(entries: readonly CollectionEntry[]) {
  const counts: Record<string, number> = Object.create(null)
  for (const entry of entries) {
    if (!entry.groups) counts[entry.entryId] = (counts[entry.entryId] ?? 0) + entry.models
    else
      for (const group of entry.groups)
        for (const id of new Set(group.builds.map((build) => build.entryId))) counts[id] = (counts[id] ?? 0) + group.models
  }
  return counts
}

type CollectionFaction = { catalogueId: string; name: string; units: readonly { id: string; slug: string; name: string }[] }

export function collectionDatasheets(factions: readonly CollectionFaction[]) {
  const sheets = new Map<string, { id: string; catalogueId: string; faction: string; slug: string; name: string }>()
  for (const faction of factions)
    for (const unit of faction.units)
      if (!sheets.has(unit.id)) sheets.set(unit.id, { ...unit, catalogueId: faction.catalogueId, faction: faction.name })
  return sheets
}

export function groupCollection(entries: readonly (CollectionEntry & { photoIds?: string[] })[], factions: readonly CollectionFaction[]) {
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
        photoIds?: string[]
        groups?: CollectionModelGroup[]
      }[]
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
