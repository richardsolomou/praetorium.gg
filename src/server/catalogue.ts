import fs from 'node:fs'
import path from 'node:path'
import {
  buildIndex,
  type CatalogueFile,
  type CatalogueIndex,
  type Definition,
  type InfoGroup,
  type Profile,
  type SelectionEntry,
} from '../core/catalogue'
import { evaluate, hiddenByRules, rosterLimit } from '../core/evaluate'
import { buildUnit } from '../core/roster'
import { routeSlug } from '../core/slug'

/**
 * The community catalogue data, if this instance has any.
 *
 * Loaded once, on the first request that needs it rather than at boot: an
 * instance whose operator has not run `catalogue:sync` should still start, serve
 * battles, and simply not offer list building. The whole set is about 90MB of
 * heap, which is why it is held in the process rather than compiled down.
 */
export function catalogueDirectory(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return process.env.CATALOGUE_DIR ?? path.join(path.resolve(dataDirectory), 'catalogue')
}

export type LoadedCatalogue = {
  index: CatalogueIndex
  factions: { id: string; name: string; references: CatalogueReference[] }[]
  /** The detachment options each book offers, keyed by catalogue id. */
  detachments: Map<string, DetachmentOptions>
}

export type CatalogueReference = { id: string; name: string; datasheets: number; detachments: number }

/**
 * How a book presents its detachments: one wrapper entry the roster must hold
 * exactly one of, a group inside it, and the choices in that group.
 */
export type DetachmentOptions = { wrapperId: string; groupId: string; options: DetachmentOption[] }

/**
 * A detachment and the force disposition it plays under.
 *
 * The disposition decides the mission, and the catalogues state it as one of the
 * detachment's keywords — "Reconnaissance", "Take and Hold" — alongside unrelated
 * ones, so it is recognised by name rather than by position.
 */
export type DetachmentOption = { id: string; name: string; disposition: string | null }

export type DetachmentCatalogueDetail = {
  rule: { name: string; description: string | null } | null
  enhancements: { name: string; points: number | null; description: string | null }[]
}

const DISPOSITIONS = new Set(['take-and-hold', 'disruption', 'purge-the-foe', 'priority-assets', 'reconnaissance'])

const asDisposition = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const DETACHMENT_ENTRY = 'Detachment'

/** Libraries hold shared entries for other books and are never picked directly. */
const LIBRARY_SUFFIX = ' Library'

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
  const factions = [...index.catalogues.values()]
    .filter(
      (catalogue) =>
        !catalogue.library && !catalogue.gameSystem && !catalogue.name.endsWith(LIBRARY_SUFFIX) && unitCount(index, catalogue.id) > 0,
    )
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

  return { index, factions, detachments }
}

export function detachmentsOf(files: readonly CatalogueFile[], index: CatalogueIndex): Map<string, DetachmentOptions> {
  const found = new Map<string, DetachmentOptions>()
  const catalogues = new Map(files.flatMap((file) => (file.catalogue ? [[file.catalogue.id, file.catalogue] as const] : [])))
  for (const file of files) {
    const root = file.catalogue
    if (!root) continue
    const sources = [root]
    for (const link of root.catalogueLinks ?? []) {
      const linked = catalogues.get(link.targetId)
      if (linked) sources.push(linked)
    }
    let best: DetachmentOptions | undefined
    for (const source of sources) {
      const wrapper: SelectionEntry | undefined = [...(source.selectionEntries ?? []), ...(source.sharedSelectionEntries ?? [])].find(
        (entry) => entry.name === DETACHMENT_ENTRY && entry.type === 'upgrade',
      )
      const linkedGroup = wrapper?.entryLinks
        ?.map((link) => index.definitions.get(link.targetId))
        .find((definition) => definition && 'selectionEntries' in definition)
      const group = wrapper?.selectionEntryGroups?.[0] ?? linkedGroup
      const options = (group?.selectionEntries ?? [])
        .filter((entry) => !entry.hidden && entry.name && !hiddenByRules(entry, index, { primaryCatalogueId: root.id }))
        .map((entry) => ({
          id: entry.id,
          name: entry.name ?? entry.id,
          disposition:
            (entry.categoryLinks ?? []).map((link) => asDisposition(link.name ?? '')).find((slug) => DISPOSITIONS.has(slug)) ?? null,
        }))
        .toSorted((left, right) => left.name.localeCompare(right.name))
      if (wrapper && group && options.length > (best?.options.length ?? 0)) {
        best = { wrapperId: wrapper.id, groupId: group.id, options }
      }
    }
    if (best) found.set(root.id, best)
  }
  return found
}

/** Full catalogue-authored text for one detachment and its enhancements. */
export function detachmentCatalogueDetail(
  loaded: LoadedCatalogue,
  catalogueId: string,
  detachmentId: string,
  enhancementNames: readonly string[],
): DetachmentCatalogueDetail | null {
  const option = loaded.detachments.get(catalogueId)?.options.find((candidate) => candidate.id === detachmentId)
  if (!option) return null
  const definition = loaded.index.definitions.get(option.id)
  const rule = definition?.infoLinks
    ?.map((link) => loaded.index.rules.get(link.targetId))
    .find((candidate) => candidate && !candidate.hidden)

  const wanted = new Set(enhancementNames.map((name) => name.toLocaleLowerCase()))
  const enhancements = [...loaded.index.definitions.values()]
    .filter(
      (entry): entry is SelectionEntry =>
        entry.type === 'upgrade' && entry.comment === option.name && Boolean(entry.name && wanted.has(entry.name.toLocaleLowerCase())),
    )
    .map((entry) => ({
      name: entry.name!,
      points: entry.costs?.find((cost) => cost.typeId === loaded.index.pointsTypeId)?.value ?? null,
      description:
        entry.profiles?.flatMap((profile) => profile.characteristics ?? []).find((characteristic) => characteristic.name === 'Description')
          ?.$text ?? null,
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name))

  return {
    rule: rule?.name ? { name: rule.name, description: rule.description ?? null } : null,
    enhancements,
  }
}

function unitCount(index: CatalogueIndex, catalogueId: string) {
  let found = 0
  for (const id of index.datasheets) {
    if (index.catalogueOf.get(id) === catalogueId) found++
  }
  return found
}

/**
 * The shelf a datasheet sits on in the picker.
 *
 * Eleventh edition writes the role as a keyword rather than a field, so it is read
 * off the datasheet's own categories. Anything that claims none of them is `other`,
 * which is where the game puts most of itself.
 */
export type UnitGroup = 'character' | 'battleline' | 'transport' | 'other'

export type UnitSummary = { id: string; slug: string; name: string; points: number | null; group: UnitGroup; limit: number | null }

export type Datasheet = {
  id: string
  slug: string
  name: string
  points: number | null
  keywords: string[]
  profiles: { id: string; name: string; type: string; values: { name: string; value: string }[] }[]
}

/** Structured display data for one top-level datasheet, including linked shared profiles. */
export function datasheetIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string): Datasheet | null {
  if (!loaded.index.datasheets.has(entryId) || loaded.index.catalogueOf.get(entryId) !== catalogueId) return null
  const root = loaded.index.definitions.get(entryId)
  if (!root) return null

  const profiles = new Map<string, Profile>()
  const visited = new Set<string>()
  const addGroup = (group: InfoGroup) => group.profiles?.forEach((profile) => profiles.set(profile.id, profile))
  const addProfiles = (definition: Definition) => {
    definition.profiles?.forEach((profile) => profiles.set(profile.id, profile))
    definition.infoGroups?.forEach(addGroup)
    for (const link of definition.infoLinks ?? []) {
      const shared = loaded.index.shared.get(link.targetId)
      if (!shared) continue
      if ('characteristics' in shared) profiles.set(shared.id, { ...shared, name: link.name ?? shared.name })
      else addGroup(shared)
    }
  }
  const visit = (definition: Definition) => {
    if (visited.has(definition.id)) return
    visited.add(definition.id)
    addProfiles(definition)
    definition.selectionEntries?.forEach(visit)
    definition.selectionEntryGroups?.forEach(visit)
    for (const link of definition.entryLinks ?? []) {
      visit(link)
      const target = loaded.index.definitions.get(link.targetId)
      // A linked group may be a catalogue-wide library. Its own profile belongs
      // here; recursively importing all its children does not.
      if (target) addProfiles(target)
    }
  }
  visit(root)

  return {
    id: root.id,
    slug: datasheetSlug(loaded, catalogueId, root.id),
    name: root.name ?? root.id,
    points: priceOf(loaded, catalogueId, entryId),
    keywords: [...new Set((root.categoryLinks ?? []).map((link) => link.name).filter((name): name is string => Boolean(name)))].toSorted(),
    profiles: [...profiles.values()]
      .filter((profile) => !profile.hidden && profile.name && profile.typeName)
      .map((profile) => ({
        id: profile.id,
        name: profile.name!,
        type: profile.typeName!,
        values: (profile.characteristics ?? []).flatMap((value) =>
          value.name && value.$text ? [{ name: value.name, value: value.$text }] : [],
        ),
      })),
  }
}

const GROUP_BY_CATEGORY = new Map<string, UnitGroup>([
  ['character', 'character'],
  ['battleline', 'battleline'],
  ['dedicated transport', 'transport'],
])

function groupOf(entry: Definition): UnitGroup {
  for (const link of entry.categoryLinks ?? []) {
    const group = GROUP_BY_CATEGORY.get((link.name ?? '').trim().toLowerCase())
    if (group) return group
  }
  return 'other'
}

/** The same shelf by entry id, so a roster and the picker cannot sort a unit differently. */
export function groupOfEntry(index: CatalogueIndex, entryId: string): UnitGroup {
  const entry = index.definitions.get(entryId)
  return entry ? groupOf(entry) : 'other'
}

/**
 * The pickable datasheets in a book, with the price of the smallest legal version
 * of each. Points are derived here and never stored: the data revision is what a
 * roster pins, and the number follows from it.
 *
 * Pricing is the same `buildUnit` the roster itself goes through, so a number in
 * the picker cannot disagree with the number the unit costs once added. A page of
 * results is small enough for that to be cheap; the whole book would not be.
 */
export function unitsIn(loaded: LoadedCatalogue, catalogueId: string, query: string, limit = 60): UnitSummary[] {
  const wanted = query.trim().toLowerCase()
  const found: { id: string; name: string; group: UnitGroup }[] = []

  for (const entries of loaded.index.unitsByName.values()) {
    for (const entry of entries) {
      if (loaded.index.catalogueOf.get(entry.id) !== catalogueId) continue
      // A character is a model entry, not a unit entry, so filtering on `unit`
      // hid most of the game. Depth is what says "pickable".
      if (entry.hidden || !loaded.index.datasheets.has(entry.id)) continue
      if (!entry.name || (wanted && !entry.name.toLowerCase().includes(wanted))) continue
      found.push({ id: entry.id, name: entry.name, group: groupOf(entry) })
    }
  }

  return found
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit)
    .map((unit) => ({
      id: unit.id,
      slug: datasheetSlug(loaded, catalogueId, unit.id),
      name: unit.name,
      group: unit.group,
      points: priceOf(loaded, catalogueId, unit.id),
      limit: limitOf(loaded, catalogueId, unit.id),
    }))
}

/** Name slugs stay clean unless a book genuinely contains two same-named sheets. */
export function datasheetSlug(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const entry = loaded.index.definitions.get(entryId)
  const base = routeSlug(entry?.name ?? entryId)
  const collisions = [...loaded.index.datasheets].filter((id) => {
    if (loaded.index.catalogueOf.get(id) !== catalogueId) return false
    return routeSlug(loaded.index.definitions.get(id)?.name ?? id) === base
  })
  return collisions.length > 1 ? `${base}-${entryId.slice(0, 8)}` : base
}

export function datasheetInBySlug(loaded: LoadedCatalogue, catalogueId: string, slug: string) {
  const entryId = [...loaded.index.datasheets].find(
    (id) => loaded.index.catalogueOf.get(id) === catalogueId && (id === slug || datasheetSlug(loaded, catalogueId, id) === slug),
  )
  return entryId ? datasheetIn(loaded, catalogueId, entryId) : null
}

/** How many of one datasheet the roster may hold, or null when nothing limits it. */
function limitOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const entry = loaded.index.definitions.get(entryId)
  return entry ? rosterLimit(entry, loaded.index, { primaryCatalogueId: catalogueId }) : null
}

/** What the smallest legal version of one datasheet costs, or null if it cannot be built. */
function priceOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const built = buildUnit(entryId, loaded.index, undefined, undefined, { primaryCatalogueId: catalogueId })
  if (!built) return null
  return evaluate([built.selection], loaded.index, { primaryCatalogueId: catalogueId }).points
}
