import fs from 'node:fs'
import path from 'node:path'
import {
  buildIndex,
  type Catalogue,
  type CatalogueFile,
  type CatalogueIndex,
  type Definition,
  importsOf,
  nameOf,
  targetOf,
} from '../core/catalogue'
import { hiddenByRules } from '../core/evaluate'
import { routeSlug } from '../core/slug'
import { type FactionContent, loadFactionContents } from './datacards'
import { factionDisplayName } from './factionNames'

type CatalogueReference = { id: string; name: string; datasheets: number; detachments: number }
export type DetachmentOptions = { wrapperId: string; groupId: string; options: DetachmentOption[] }
type DetachmentOption = { id: string; name: string; disposition: string | null }

export type LoadedCatalogue = {
  index: CatalogueIndex
  characteristicNames: Map<string, string>
  factions: { id: string; name: string; references: CatalogueReference[] }[]
  detachments: Map<string, DetachmentOptions>
  factionContents: Map<string, FactionContent>
}

const DISPOSITIONS = new Set(['take-and-hold', 'disruption', 'purge-the-foe', 'priority-assets', 'reconnaissance'])
const DETACHMENT_ENTRY = 'detachment'

export function catalogueDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.CATALOGUE_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue')
}

export function loadCatalogue(directory = catalogueDirectory()): LoadedCatalogue | null {
  const definitions = path.join(directory, 'definitions')
  const revisionFile = path.join(directory, 'revision.json')
  if (!fs.existsSync(definitions) || !fs.existsSync(revisionFile)) return null

  const revision: { definitions?: string } = JSON.parse(fs.readFileSync(revisionFile, 'utf8'))
  if (!revision.definitions) return null

  const files: CatalogueFile[] = fs
    .readdirSync(definitions)
    .filter((name) => name.endsWith('.json'))
    .map((name): CatalogueFile => JSON.parse(fs.readFileSync(path.join(definitions, name), 'utf8')))
  if (!files.length) return null

  const index = buildIndex(files, revision.definitions)
  const detachments = detachmentsOf(files, index)
  const factionContents = loadFactionContents(path.join(directory, 'datacards', '11th', 'gdc'))
  return {
    index,
    characteristicNames: characteristicNamesOf(files),
    factions: factionsIn(index, detachments),
    detachments,
    factionContents,
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
    .toSorted((left, right) => left.name.localeCompare(right.name))
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
        .toSorted((left, right) => left.name.localeCompare(right.name))
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
    .map((link) =>
      (link.name ?? '')
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .find((slug) => DISPOSITIONS.has(slug)) ?? null

const unitCount = (index: CatalogueIndex, catalogueId: string) => index.datasheets.get(catalogueId)?.size ?? 0

export const datasheetsOf = (index: CatalogueIndex, catalogueId: string) => index.datasheets.get(catalogueId) ?? new Set<string>()

/** Imported detachments are roster options, but their reference page belongs to the catalogue that defines the option. */
export function isReferenceDetachment(loaded: LoadedCatalogue, catalogueId: string, detachmentId: string) {
  const owner = loaded.index.catalogueOf.get(detachmentId)
  return !owner || !loaded.factions.some((faction) => faction.id === owner) || owner === catalogueId
}

/**
 * Whether a datasheet belongs on this faction's reference pages.
 *
 * An army can offer allied units from another faction. Reference pages instead
 * give a datasheet one canonical home, read from its Faction keyword. The roster
 * picker deliberately does not use this predicate.
 */
export function isReferenceDatasheet(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  if (!datasheetsOf(loaded.index, catalogueId).has(entryId)) return false
  const entry = loaded.index.definitions.get(entryId)
  if (!entry) return false
  const target = targetOf(entry, loaded.index.definitions)
  const canonicalFaction = referenceFactionOf(
    loaded,
    [...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])].map((category) => category.name),
  )
  return !canonicalFaction || factionDisplayName(loaded.index.catalogues.get(catalogueId)?.name ?? '') === canonicalFaction
}

const FACTION_CATEGORY = /^Faction:\s*(.+)$/i
const REFERENCE_FACTION_ALIASES = new Map([
  ['adeptus astartes', 'Space Marines'],
  ['heretic astartes', 'Chaos Space Marines'],
  ['asuryani', 'Aeldari'],
  ['harlequins', 'Aeldari'],
  ['legiones daemonica', 'Chaos Daemons'],
])

const factionNamesCache = new WeakMap<LoadedCatalogue, ReadonlySet<string>>()

/** The owner must be unambiguous: a datasheet genuinely filed under two factions stays visible on both pages. */
function referenceFactionOf(loaded: LoadedCatalogue, categories: readonly (string | undefined)[]) {
  const factionNames =
    factionNamesCache.get(loaded) ?? new Set(loaded.factions.map((faction) => factionDisplayName(faction.name).toLocaleLowerCase()))
  if (!factionNamesCache.has(loaded)) factionNamesCache.set(loaded, factionNames)
  const candidates = new Set(
    categories.flatMap((category) => {
      const name = category?.match(FACTION_CATEGORY)?.[1]?.trim()
      if (!name) return []
      const canonical = REFERENCE_FACTION_ALIASES.get(name.toLocaleLowerCase()) ?? name
      return factionNames.has(canonical.toLocaleLowerCase()) ? [canonical] : []
    }),
  )
  return candidates.size === 1 ? [...candidates][0] : null
}

export function isDatasheetId(index: CatalogueIndex, entryId: string, catalogueId?: string | null) {
  const offered = catalogueId ? index.datasheets.get(catalogueId) : undefined
  if (offered) return offered.has(entryId)
  for (const each of index.datasheets.values()) if (each.has(entryId)) return true
  return false
}

export function datasheetSlug(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const entry = loaded.index.definitions.get(entryId)
  const base = routeSlug(entry?.name ?? entryId)
  const collisions = [...datasheetsOf(loaded.index, catalogueId)].filter(
    (id) => routeSlug(nameOf(loaded.index.definitions.get(id) ?? { id }, loaded.index.definitions)) === base,
  )
  return collisions.length > 1 ? `${base}-${entryId.slice(0, 8)}` : base
}
