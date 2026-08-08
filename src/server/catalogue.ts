import fs from 'node:fs'
import path from 'node:path'
import {
  buildIndex,
  type Catalogue,
  type CatalogueFile,
  type CatalogueIndex,
  type Definition,
  type InfoGroup,
  type InfoLink,
  importsOf,
  nameOf,
  type Profile,
  type SelectionEntry,
  targetOf,
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

type CatalogueReference = { id: string; name: string; datasheets: number; detachments: number }

/**
 * How a book presents its detachments: one wrapper entry the roster must hold
 * exactly one of, a group inside it, and the choices in that group.
 */
type DetachmentOptions = { wrapperId: string; groupId: string; options: DetachmentOption[] }

/**
 * A detachment and the force disposition it plays under.
 *
 * The disposition decides the mission, and the catalogues state it as one of the
 * detachment's keywords — "Reconnaissance", "Take and Hold" — alongside unrelated
 * ones, so it is recognised by name rather than by position.
 */
type DetachmentOption = { id: string; name: string; disposition: string | null }

type DetachmentCatalogueDetail = {
  rule: { name: string; description: string | null } | null
  enhancements: { name: string; points: number | null; description: string | null }[]
}

const DISPOSITIONS = new Set(['take-and-hold', 'disruption', 'purge-the-foe', 'priority-assets', 'reconnaissance'])

const asDisposition = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** "Detachment", "Detachments", "Detachment Choice" — the three the books use. */
const DETACHMENT_ENTRY = 'detachment'

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
  return { index, factions: factionsIn(index, detachments), detachments }
}

/**
 * The books a player can build a list from.
 *
 * `index.datasheets` is keyed by the books that offer something, so a library and
 * the game system are already absent from it — this names what is left rather than
 * deciding anything.
 */
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
    // The book's own detachments always win. Only a book with none of its own —
    // a chapter, a titan legion — falls through to what it imports, largest
    // borrowed roster first, because that is the book it mostly is.
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

/**
 * The entry a roster holds its detachments in, if this book has one.
 *
 * Both layers may be written out or linked, and which one a book uses is not
 * consistent: Astra Militarum link a group holding thirteen, Necrons write theirs
 * inline. The name varies too — "Detachment", "Detachments", "Detachment Choice" —
 * so it is matched by prefix.
 */
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

/** The groups an entry holds, whether it writes them out or links them. */
const groupsOf = (entry: Definition): Definition[] => [
  ...(entry.selectionEntryGroups ?? []),
  ...(entry.entryLinks ?? []).filter((link) => link.type === 'selectionEntryGroup'),
]

const dispositionOf = (option: Definition, index: CatalogueIndex) =>
  [...(option.categoryLinks ?? []), ...(targetOf(option, index.definitions).categoryLinks ?? [])]
    .map((link) => asDisposition(link.name ?? ''))
    .find((slug) => DISPOSITIONS.has(slug)) ?? null

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

  const upgrades = [...loaded.index.definitions.values()].filter((entry): entry is SelectionEntry => entry.type === 'upgrade')
  const enhancements = enhancementNames
    .map((name) => {
      const candidates = upgrades.filter((entry) => entry.name?.toLocaleLowerCase() === name.toLocaleLowerCase())
      const entry =
        unambiguous(candidates.filter((candidate) => candidate.comment === option.name)) ??
        unambiguous(candidates.filter((candidate) => loaded.index.catalogueOf.get(candidate.id) === catalogueId)) ??
        unambiguous(candidates)
      return {
        name,
        points: entry?.costs?.find((cost) => cost.typeId === loaded.index.pointsTypeId)?.value ?? null,
        description: entry ? descriptionOf(entry) : null,
      }
    })
    .toSorted((left, right) => left.name.localeCompare(right.name))

  return {
    rule: rule?.name ? { name: rule.name, description: rule.description ?? null } : null,
    enhancements,
  }
}

const descriptionOf = (entry: SelectionEntry) =>
  entry.profiles?.flatMap((profile) => profile.characteristics ?? []).find((characteristic) => characteristic.name === 'Description')
    ?.$text ?? null

/** Picks only when every matching entry says the same thing. */
function unambiguous(entries: readonly SelectionEntry[]): SelectionEntry | null {
  const described = entries.filter((entry) => descriptionOf(entry))
  return new Set(described.map(descriptionOf)).size === 1 ? (described[0] ?? null) : null
}

/**
 * How many datasheets a book offers — its own and whatever it imports.
 *
 * Not how many it owns: a chapter owns a couple of dozen and fields two hundred
 * and fifty, and eight books own none at all.
 */
const unitCount = (index: CatalogueIndex, catalogueId: string) => index.datasheets.get(catalogueId)?.size ?? 0

/** The ids a book offers, which is the only sense in which a datasheet is "in" it. */
const datasheetsOf = (index: CatalogueIndex, catalogueId: string) => index.datasheets.get(catalogueId) ?? new Set<string>()

/**
 * Whether an id is a datasheet at all, for a caller with no book in hand.
 *
 * An imported roster names entries from whatever books it was built with, so the
 * question there is "is this a unit or a piece of wargear", not "does this book
 * offer it". Naming the book when it is known keeps the answer precise.
 */
export function isDatasheetId(index: CatalogueIndex, entryId: string, catalogueId?: string | null) {
  // A book we hold answers precisely. A book we do not — an export naming a
  // catalogue this instance never synced — falls back to whether any book offers
  // the entry at all, because the alternative is dropping the unit silently.
  const offered = catalogueId ? index.datasheets.get(catalogueId) : undefined
  if (offered) return offered.has(entryId)
  for (const each of index.datasheets.values()) if (each.has(entryId)) return true
  return false
}

/**
 * The shelf a datasheet sits on in the picker.
 *
 * Eleventh edition writes the role as a keyword rather than a field, so it is read
 * off the datasheet's own categories. Anything that claims none of them is `other`,
 * which is where the game puts most of itself.
 */
export type UnitGroup = 'character' | 'battleline' | 'transport' | 'other'

type UnitSummary = { id: string; slug: string; name: string; points: number | null; group: UnitGroup; limit: number | null }

export type Datasheet = {
  id: string
  slug: string
  name: string
  points: number | null
  keywords: string[]
  profiles: { id: string; name: string; type: string; values: { name: string; value: string }[] }[]
  abilities: { id: string; name: string; description: string | null; kind: AbilityKind }[]
  keywordRules: { name: string; description: string }[]
}

type AbilityKind = 'core' | 'faction' | 'datasheet' | 'rule' | 'wargear'

const abilityDescription = (profile: Profile) =>
  profile.characteristics?.find((characteristic) => characteristic.name === 'Description')?.$text ?? null

/** Structured display data for one top-level datasheet, including linked shared profiles. */
export function datasheetIn(loaded: LoadedCatalogue, catalogueId: string, entryId: string): Datasheet | null {
  if (!datasheetsOf(loaded.index, catalogueId).has(entryId)) return null
  const root = loaded.index.definitions.get(entryId)
  if (!root) return null

  const profiles = new Map<string, Profile>()
  const abilities = new Map<string, Datasheet['abilities'][number]>()
  const keywordRules = new Map<string, Datasheet['keywordRules'][number]>()
  const visited = new Set<string>()
  const addProfile = (profile: Profile, kind: AbilityKind) => {
    if (profile.typeName === 'Abilities' && profile.name && !profile.hidden) {
      abilities.set(`${kind}:${profile.id}`, { id: profile.id, name: profile.name, description: abilityDescription(profile), kind })
    } else {
      profiles.set(profile.id, profile)
    }
  }
  const addRule = (link: InfoLink, kind: AbilityKind) => {
    if (link.hidden || link.type !== 'rule') return
    const rule = loaded.index.rules.get(link.targetId)
    const name = link.name ?? rule?.name
    if (name && !rule?.hidden) abilities.set(`${kind}:${link.id}`, { id: link.id, name, description: rule?.description ?? null, kind })
  }
  const addGroup = (group: InfoGroup) => {
    if (group.hidden) return
    group.profiles?.forEach((profile) => addProfile(profile, 'rule'))
    group.infoLinks?.forEach((link) => addRule(link, 'core'))
  }
  const addProfiles = (definition: Definition, kind: AbilityKind = 'datasheet', ownRules = false) => {
    definition.profiles?.forEach((profile) => addProfile(profile, kind))
    definition.infoGroups?.forEach(addGroup)
    for (const link of definition.infoLinks ?? []) {
      const linkedRule = link.type === 'rule' ? loaded.index.rules.get(link.targetId) : undefined
      if (!link.hidden && !linkedRule?.hidden && link.name && linkedRule?.description) {
        keywordRules.set(link.name.toLocaleLowerCase(), { name: link.name, description: linkedRule.description })
      }
      if (ownRules) addRule(link, 'faction')
      const shared = loaded.index.shared.get(link.targetId)
      if (!shared) continue
      if ('characteristics' in shared) addProfile({ ...shared, name: link.name ?? shared.name }, kind)
    }
  }
  const visit = (definition: Definition, isRoot = false) => {
    if (visited.has(definition.id)) return
    visited.add(definition.id)
    addProfiles(definition, 'datasheet', isRoot)
    definition.selectionEntries?.forEach((entry) => visit(entry))
    definition.selectionEntryGroups?.forEach((group) => visit(group))
    for (const link of definition.entryLinks ?? []) {
      visit(link)
      const target = loaded.index.definitions.get(link.targetId)
      // A linked group may be a catalogue-wide library. Its own profile belongs
      // here; recursively importing all its children does not.
      if (target) addProfiles(target, 'wargear')
    }
  }
  // A book reaches most of its datasheets through a link, and everything a
  // datasheet displays — profiles, abilities, keywords — is on the entry the link
  // points at. The link is visited first because it may add to what it points at.
  const sheet = targetOf(root, loaded.index.definitions)
  visit(root, true)
  if (sheet !== root) visit(sheet, true)

  const keywords = [...(root.categoryLinks ?? []), ...(sheet === root ? [] : (sheet.categoryLinks ?? []))]

  return {
    id: root.id,
    slug: datasheetSlug(loaded, catalogueId, root.id),
    name: nameOf(root, loaded.index.definitions),
    points: priceOf(loaded, catalogueId, entryId),
    keywords: [...new Set(keywords.map((link) => link.name).filter((name): name is string => Boolean(name)))].toSorted(),
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
    abilities: [...abilities.values()],
    keywordRules: [...keywordRules.values()],
  }
}

export function rulesReferencedIn(loaded: LoadedCatalogue, texts: readonly (string | null)[]) {
  const references = new Set(
    texts.flatMap((text) =>
      [...(text ?? '').matchAll(/\*\*(.*?)\*\*|\^\^(.*?)\^\^|\[([A-Z][A-Z0-9 +'-]*)\]/g)].map((match) =>
        (match[1] ?? match[2] ?? match[3] ?? '').replaceAll(/\*\*|\^\^/g, ''),
      ),
    ),
  )
  const candidates = new Map<string, Set<string>>()
  for (const rule of loaded.index.rules.values()) {
    if (!rule.name || !rule.description) continue
    const name = rule.name.toLocaleLowerCase()
    if (
      ![...references].some((reference) => reference.toLocaleLowerCase() === name || reference.toLocaleLowerCase().startsWith(`${name} `))
    ) {
      continue
    }
    const descriptions = candidates.get(rule.name) ?? new Set<string>()
    descriptions.add(rule.description)
    candidates.set(rule.name, descriptions)
  }
  return [...candidates].flatMap(([name, descriptions]) =>
    descriptions.size === 1 ? [{ name, description: descriptions.values().next().value! }] : [],
  )
}

const GROUP_BY_CATEGORY = new Map<string, UnitGroup>([
  ['character', 'character'],
  ['battleline', 'battleline'],
  ['dedicated transport', 'transport'],
])

/** The keywords are on the datasheet, so a link is read together with what it points at. */
function groupOf(entry: Definition, target: Definition): UnitGroup {
  for (const link of [...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])]) {
    const group = GROUP_BY_CATEGORY.get((link.name ?? '').trim().toLowerCase())
    if (group) return group
  }
  return 'other'
}

/** The same shelf by entry id, so a roster and the picker cannot sort a unit differently. */
export function groupOfEntry(index: CatalogueIndex, entryId: string): UnitGroup {
  const entry = index.definitions.get(entryId)
  return entry ? groupOf(entry, targetOf(entry, index.definitions)) : 'other'
}

/**
 * Datasheets Games Workshop has moved to Legends, which say so in their own name.
 *
 * There is no category and no flag for it — the community data marks them by
 * suffix and nothing else, which is also how every other builder finds them. They
 * are not legal here, so the picker never offers them.
 */
const LEGENDS = /\[legends\]/i

/**
 * The pickable datasheets in a book, with the price of the smallest legal version
 * of each. Points are derived here and never stored: the data revision is what a
 * roster pins, and the number follows from it.
 *
 * Pricing is the same `buildUnit` the roster itself goes through, so a number in
 * the picker cannot disagree with the number the unit costs once added. A page of
 * results is small enough for that to be cheap; the whole book would not be.
 */
export function unitsIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  query: string,
  { limit = 60 }: { limit?: number } = {},
): UnitSummary[] {
  const wanted = query.trim().toLowerCase()
  const found: { id: string; name: string; group: UnitGroup }[] = []

  for (const id of datasheetsOf(loaded.index, catalogueId)) {
    const entry = loaded.index.definitions.get(id)
    if (!entry) continue
    const target = targetOf(entry, loaded.index.definitions)
    if (entry.hidden || target.hidden) continue
    const name = nameOf(entry, loaded.index.definitions)
    if (LEGENDS.test(name)) continue
    if (wanted && !name.toLowerCase().includes(wanted)) continue
    found.push({ id, name, group: groupOf(entry, target) })
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
function datasheetSlug(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const entry = loaded.index.definitions.get(entryId)
  const base = routeSlug(entry?.name ?? entryId)
  const collisions = [...datasheetsOf(loaded.index, catalogueId)].filter(
    (id) => routeSlug(nameOf(loaded.index.definitions.get(id) ?? { id }, loaded.index.definitions)) === base,
  )
  return collisions.length > 1 ? `${base}-${entryId.slice(0, 8)}` : base
}

export function datasheetInBySlug(loaded: LoadedCatalogue, catalogueId: string, slug: string) {
  const entryId = [...datasheetsOf(loaded.index, catalogueId)].find((id) => id === slug || datasheetSlug(loaded, catalogueId, id) === slug)
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
