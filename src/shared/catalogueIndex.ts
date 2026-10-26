import { cachedIn, countBy, remember } from '../core/collections'
import { type Catalogue, type CatalogueFile, type CatalogueIndex, type Definition, importsOf, nameOf, targetOf } from '../core/catalogue'
import { hiddenByRules } from '../core/evaluate'
import { routeSlug } from '../core/slug'
import { type DatasheetPage, datasheetPageBySlug, datasheetSlugFor } from '../core/datasheetSlug'
import { compareText, sameText } from '../core/text'
import type { FactionContent, LoadedDatacards } from './datacards'
import { catalogueFactionName, factionDisplayName } from './factionNames'
import type { MfmIndex } from './mfm'
import type { CatalogueEdition } from '../core/catalogueEdition'
type CatalogueReference = { id: string; name: string; datasheets: number; detachments: number }
type DetachmentOptions = { wrapperId: string; groupId: string; options: DetachmentOption[] }
type DetachmentOption = { id: string; name: string; disposition: string | null }
export type LoadedCatalogue = {
  edition?: CatalogueEdition
  datacardExcludedCatalogueIds?: ReadonlySet<string>
  index: CatalogueIndex
  characteristicNames: Map<string, string>
  factions: { id: string; name: string; references: CatalogueReference[] }[]
  detachments: Map<string, DetachmentOptions>
  factionContents: Map<string, FactionContent>
  mfm?: MfmIndex | null
  /** Game Datacards, read once here and handed to the rules loader. */
  datacards: LoadedDatacards
  /**
   * The token a BSData rules text is published as, or null for a string no definitions file
   * states. The catalogue computes from the words; only what it publishes carries tokens.
   */
  definitionTexts?: (raw: string) => string | null
}
export const DISPOSITIONS = new Set(['take-and-hold', 'disruption', 'purge-the-foe', 'priority-assets', 'reconnaissance'])
const DETACHMENT_ENTRY = 'detachment'
export function catalogueFromIndex(index: CatalogueIndex, files: readonly CatalogueFile[], datacards: LoadedDatacards): LoadedCatalogue {
  const detachments = detachmentsOf(files, index)
  return {
    index,
    characteristicNames: characteristicNamesOf(files),
    factions: factionsIn(index, detachments),
    detachments,
    factionContents: datacards.factions,
    datacards,
  }
}
/** Characteristic type ids are defined inline throughout the source files. */
export function characteristicNamesOf(files: readonly CatalogueFile[]) {
  const names = new Map<string, string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (typeof record.typeId === 'string' && typeof record.name === 'string' && typeof record.$text === 'string') {
      names.set(record.typeId, record.name)
    }
    Object.values(record).forEach(visit)
  }
  files.forEach(visit)
  return names
}
export function factionsIn(index: CatalogueIndex, detachments: Map<string, DetachmentOptions>) {
  return [...index.catalogues.values()]
    .filter((catalogue) => unitCount(index, catalogue.id) > 0)
    .map((catalogue) => ({
      id: catalogue.id,
      name: catalogue.name,
      references: [
        {
          id: catalogue.id,
          name: catalogue.name,
          datasheets: unitCount(index, catalogue.id),
          detachments: detachments.get(catalogue.id)?.options.length ?? 0,
        },
      ],
    }))
    .toSorted((left, right) => compareText(left.name, right.name))
}
export function detachmentsOf(files: readonly CatalogueFile[], index: CatalogueIndex): Map<string, DetachmentOptions> {
  const books = new Map<string, Catalogue>()
  for (const file of files) if (file.catalogue) books.set(file.catalogue.id, file.catalogue)

  const found = new Map<string, DetachmentOptions>()
  for (const book of books.values()) {
    if (book.library) continue
    for (const source of [book, ...importsOf(book, books, index.definitions)]) {
      const wrapper = wrapperIn(source, index)
      if (!wrapper) continue
      const options = wrapper.options
        .filter((option) => !option.hidden && !hiddenByRules(option, index, { primaryCatalogueId: book.id }))
        .map((option) => ({
          id: option.id,
          name: nameOf(option, index.definitions),
          disposition: dispositionOf(option, index),
        }))
        .toSorted((left, right) => compareText(left.name, right.name))
      if (!options.length) continue
      found.set(book.id, { wrapperId: wrapper.wrapperId, groupId: wrapper.groupId, options })
      break
    }
  }
  return found
}
function wrapperIn(book: Catalogue, index: CatalogueIndex) {
  const roots: Definition[] = [...(book.selectionEntries ?? []), ...(book.sharedSelectionEntries ?? []), ...(book.entryLinks ?? [])]
  for (const wrapper of roots) {
    const target = targetOf(wrapper, index.definitions)
    if (target.type !== 'upgrade') continue
    if (!nameOf(wrapper, index.definitions).toLowerCase().startsWith(DETACHMENT_ENTRY)) continue
    for (const group of groupsOf(target)) {
      const inside = targetOf(group, index.definitions)
      const options = [...(inside.selectionEntries ?? []), ...(inside.entryLinks ?? [])]
      if (options.length) return { wrapperId: wrapper.id, groupId: group.id, options }
    }
  }
  return null
}
const groupsOf = (entry: Definition): Definition[] => [
  ...(entry.selectionEntryGroups ?? []),
  ...(entry.entryLinks ?? []).filter((link) => link.type === 'selectionEntryGroup'),
]
const dispositionOf = (option: Definition, index: CatalogueIndex) =>
  [...(option.categoryLinks ?? []), ...(targetOf(option, index.definitions).categoryLinks ?? [])]
    .map((link) => routeSlug(link.name ?? ''))
    .find((slug) => DISPOSITIONS.has(slug)) ?? null
const unitCount = (index: CatalogueIndex, catalogueId: string) => index.datasheets.get(catalogueId)?.size ?? 0
export const datasheetsOf = (index: CatalogueIndex, catalogueId: string) => index.datasheets.get(catalogueId) ?? new Set<string>()
/**
 * Whether a datasheet belongs on this faction's public discovery surfaces.
 *
 * An army can offer allied units from another faction. Reference pages, global
 * search, and the simulator use the written Faction category or the defining
 * book as their canonical home. The roster picker deliberately keeps all offers.
 */
export function isReferenceDatasheet(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  if (!datasheetsOf(loaded.index, catalogueId).has(entryId)) return false
  if (!loaded.index.definitions.has(entryId)) return false
  const factions = entryFactions(loaded, entryId)
  if (factions.size > 1) return true
  if (factions.size === 1) return factions.has(factionDisplayName(loaded.index.catalogues.get(catalogueId)?.name ?? ''))
  const owner = loaded.index.catalogueOf.get(entryId)
  return !owner || owner === catalogueId || !loaded.factions.some((faction) => faction.id === owner)
}
/** The factions an entry's own Faction categories name, among those the catalogue holds, by display name. */
export function entryFactions(loaded: LoadedCatalogue, entryId: string) {
  const entry = loaded.index.definitions.get(entryId)
  if (!entry) return new Set<string>()
  const target = targetOf(entry, loaded.index.definitions)
  return referenceFactionsOf(
    loaded,
    [...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])].map((category) => category.name),
  )
}
const FACTION_CATEGORY = /^Faction:\s*(.+)$/i
const factionNamesCache = new WeakMap<LoadedCatalogue, ReadonlySet<string>>()
/** A datasheet genuinely filed under two factions stays visible on both pages. */
function referenceFactionsOf(loaded: LoadedCatalogue, categories: readonly (string | undefined)[]) {
  const factionNames = remember(
    factionNamesCache,
    loaded,
    () => new Set(loaded.factions.map((faction) => factionDisplayName(faction.name).toLowerCase())),
  )
  const candidates = new Set(
    categories.flatMap((category) => {
      const name = category?.match(FACTION_CATEGORY)?.[1]?.trim()
      if (!name) return []
      const canonical = catalogueFactionName(name)
      return factionNames.has(canonical.toLowerCase()) ? [canonical] : []
    }),
  )
  return candidates
}
type DatasheetSlugs = { byEntry: Map<string, string>; pages: DatasheetPage[] }
const datasheetSlugCache = new WeakMap<LoadedCatalogue, Map<string, DatasheetSlugs>>()
/** Slugs for a whole book at once: collision detection is per book, not per entry. */
function datasheetSlugsFor(loaded: LoadedCatalogue, catalogueId: string): DatasheetSlugs {
  return cachedIn(datasheetSlugCache, loaded, catalogueId, () => datasheetSlugsOf(loaded, catalogueId))
}
function datasheetSlugsOf(loaded: LoadedCatalogue, catalogueId: string): DatasheetSlugs {
  const ids = [...datasheetsOf(loaded.index, catalogueId)]
  const pageIds = new Set(ids.filter((id) => isReferenceDatasheet(loaded, catalogueId, id)))
  const nameSlugOf = (id: string) => routeSlug(nameOf(loaded.index.definitions.get(id) ?? { id }, loaded.index.definitions))
  // A page shares its name only with other pages, so an imported copy of it cannot move its address.
  const pageNameCounts = countBy([...pageIds], nameSlugOf)
  const nameCounts = countBy(ids, nameSlugOf)
  const byEntry = new Map<string, string>()
  const pages: DatasheetPage[] = []
  for (const id of ids) {
    const counts = pageIds.has(id) ? pageNameCounts : nameCounts
    const slug = datasheetSlugFor(routeSlug(loaded.index.definitions.get(id)?.name ?? id), id, (counts.get(nameSlugOf(id)) ?? 0) > 1)
    byEntry.set(id, slug)
    if (pageIds.has(id)) pages.push({ id, slug })
  }
  return { byEntry, pages }
}
export function datasheetSlug(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  return datasheetSlugsFor(loaded, catalogueId).byEntry.get(entryId) ?? routeSlug(loaded.index.definitions.get(entryId)?.name ?? entryId)
}
/** The reference datasheet a page slug names, as `datasheetPageBySlug` resolves it. */
export function datasheetIdBySlug(loaded: LoadedCatalogue, catalogueId: string, slug: string) {
  return datasheetPageBySlug(datasheetSlugsFor(loaded, catalogueId).pages, slug)?.id ?? null
}
/** Prefer the datasheet's own reference page; imported entries fall back to an unambiguous named match. */
export function referenceDatasheetRoute(loaded: LoadedCatalogue, name: string, preferred?: { catalogueId: string; entryId: string }) {
  const preferredFaction = preferred ? loaded.factions.find((candidate) => candidate.id === preferred.catalogueId) : undefined
  if (preferred && preferredFaction && isReferenceDatasheet(loaded, preferred.catalogueId, preferred.entryId)) {
    return {
      catalogueId: loaded.edition ? preferredFaction.id : routeSlug(factionDisplayName(preferredFaction.name)),
      slug: datasheetSlug(loaded, preferred.catalogueId, preferred.entryId),
    }
  }
  return cachedIn(referenceDatasheetRouteCache, loaded, name, () => namedDatasheetRoute(loaded, name))
}
function namedDatasheetRoute(loaded: LoadedCatalogue, name: string) {
  const matches = loaded.factions.flatMap((faction) =>
    [...datasheetsOf(loaded.index, faction.id)].flatMap((entryId) => {
      const entry = loaded.index.definitions.get(entryId)
      if (!entry || !sameText(nameOf(entry, loaded.index.definitions), name)) return []
      return isReferenceDatasheet(loaded, faction.id, entryId)
        ? [
            {
              catalogueId: loaded.edition ? faction.id : routeSlug(factionDisplayName(faction.name)),
              slug: datasheetSlug(loaded, faction.id, entryId),
            },
          ]
        : []
    }),
  )
  return matches.length === 1 ? matches[0]! : null
}
const referenceDatasheetRouteCache = new WeakMap<LoadedCatalogue, Map<string, { catalogueId: string; slug: string } | null>>()
