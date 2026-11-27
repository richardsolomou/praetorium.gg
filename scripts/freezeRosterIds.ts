import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { type Definition, nameOf, targetOf } from '../src/core/catalogue'
import { readCatalogueComposition, editionDirectory } from '../src/server/catalogueComposition'
import { groupBy } from '../src/core/collections'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { retainedRules } from '../src/core/retainedRosterRules'
import { currentCatalogueId, currentDetachmentId, currentEntryId, migratedCatalogueIds } from '../src/core/retiredCatalogueIds'
import { correctedIds, legacyIdCorrections } from '../src/core/legacyRosterIds'
import { freezeLegacyIds } from './lib/legacyIdFiles'

/**
 * Adds to `catalogue/legacy-ids/` the VS Data ID of every book, Detachment, datasheet and Enhancement ID a saved roster
 * can hold, for each rules version of a catalogue snapshot whose VS Data release is unpacked beside the others. The
 * maps are append-only: an ID they already hold never moves.
 *
 *   pnpm exec tsx scripts/freezeRosterIds.ts <catalogue directory> <directory of unpacked releases, one per rules version>
 */
const [catalogueDirectory, releases] = process.argv.slice(2)
if (!catalogueDirectory || !releases) throw new Error('Usage: tsx scripts/freezeRosterIds.ts <catalogue directory> <releases directory>')

/** Each book's VS Data faction, by hand: the names differ (Xenos - Aeldari is Asuryani), and libraries are no faction. */
const BOOKS: Record<string, string> = {
  '03fe-a162-4c02-f07b': 'emperors-children',
  '1069-10ff-3ba9-873b': 'thousand-sons',
  '14f0-2e5f-1ef8-7d6a': 'iron-hands',
  '1f19-6509-d906-ca10': 'adeptus-custodes',
  '2261-79a5-19d9-1668': 'salamanders',
  '23d7-91c9-24dc-263a': 'imperial-fists',
  '25dd-7aa0-6bf4-f2d5': 'imperial-knights',
  '2f78-9f73-b44f-3807': 'white-scars',
  '323f-498b-f3a0-377f': 'raven-guard',
  '34a5-8c7e-f468-82d1': 'aeldari',
  '36d3-36bc-68dd-40ac': 'black-templars',
  '38de-521f-1ce0-44a0': 'drukhari',
  '3bdf-a114-5035-c6ac': 'genestealer-cults',
  '4029-9237-e8db-af55': 'ultramarines',
  '46d8-abc8-ef3a-9f85': 'chaos-knights',
  '470a-6daa-9014-12df': 'dark-angels',
  '4eef-e313-1eea-94a6': 'salamanders',
  '4ef9-15ce-e3e6-36de': 'blood-angels',
  '50c4-3e83-fe54-97c4': 'grey-knights',
  '5108-f98-63c2-53cb': 'death-guard',
  '5d6e-fd3-330a-11dd': 'imperial-fists',
  '67c1-fc13-f9a1-cbbf': 'white-scars',
  '6e59-e1ee-47ad-6ce5': 'raven-guard',
  '77b9-2f66-3f9b-5cf3': 'adeptus-mechanicus',
  '880c-c7e-4a43-a0c1': 'chaos-titan-legions',
  '94bb-3284-ee14-57a1': 'space-wolves',
  'a55f-b7b3-6c65-a05f': 'orks',
  'a603-5039-f08d-e841': 'ultramarines',
  'b00-cd86-4b4c-97ba': 'imperial-agents',
  'b0ae-12a5-c84-ea45': 'astra-militarum',
  'b39e-4401-8f3e-fdf7': 'adepta-sororitas',
  'b654-a18a-ea1-3bf2': 'necrons',
  'b984-7317-81cc-20f': 'tyranids',
  'bdc0-c0d-72d7-87e2': 'titan-legions',
  'c8da-e875-58f7-f6d6': 'chaos-space-marines',
  'd265-877b-e03d-30ca': 'chaos-daemons',
  'd81a-61dd-6d27-a3ce': 'tau-empire',
  'df9a-59b2-f464-59ad': 'world-eaters',
  'e0af-67df-9d63-8fb7': 'space-marines',
  'e0af-67df-9d63-8fb8': 'space-marines',
  'f27e-18c0-b73e-748e': 'iron-hands',
  'f616-3f08-ee8e-3349': 'leagues-of-votann',
  'f89b-84e0-6e3b-f1e2': 'deathwatch',
}
/** A chapter's book offers the Space Marines Detachments too, which VS Data models once under `space-marines`. */
const CHAPTERS = new Set([
  'black-templars',
  'blood-angels',
  'dark-angels',
  'deathwatch',
  'imperial-fists',
  'iron-hands',
  'raven-guard',
  'salamanders',
  'space-wolves',
  'ultramarines',
  'white-scars',
])

const entrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string().optional(),
  aliases: z.array(z.string()).nullish(),
  retired: z.object({ replacedBy: z.array(z.string()).optional() }).nullish(),
})
const detachmentSchema = z.object({ data: z.object({ faction: z.string(), enhancements: z.array(z.string()).optional() }) })
const manifestSchema = z.object({
  categories: z.array(z.object({ name: z.string(), records: z.array(z.object({ id: z.string(), kind: z.string(), path: z.string() })) })),
})

/** Names as printed, compared by their letters and digits alone: the sources differ in case, spacing, hyphens and commas. */
const same = (name: string) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

type VsDetachment = { id: string; name: string; faction: string; enhancements?: string[] }

/** An Enhancement's name without the tag one source prints and the other leaves off, as the Munitorum join reads it. */
const enhancementName = (name: string) => same(name.replace(/\s*[([](?:aura|upgrade|upgarde|one per army|psychic)[)\]]/gi, ''))

/** Reviewed spellings: an Enhancement's name as VS Data prints it, by the name BSData gives it. */
const SPELLINGS: Record<string, string> = {
  'Autoclavic Denounciation': 'Autoclavic Denunciation',
  'Biomorph Adaption': 'Biomorph Adaptation',
  'Diabolic Servant': 'Diabolic Savant',
  'Dêlvwerke Navigator': 'Dêlvewerke Navigator',
  'Fârstryder Node': 'Fârstrydr Node',
  Incandeum: 'Incandaeum',
  'Instinctive Defense': 'Instinctive Defence',
  'Naturalised Camoflage': 'Naturalised Camouflage',
  'Sharp Eyes, Light Fingers': 'Sharp Eyes',
  'Sublime Presence': 'Sublime Prescience',
  'Thief of Secrets': 'The Thief of Secrets',
  'TL-409': 'TL-4ø9',
}

/** Reviewed spellings: a Detachment's name as VS Data prints it, by the name BSData gives it. */
const DETACHMENT_SPELLINGS: Record<string, string> = { 'Brood Brother Auxilia': 'Brood Brothers Auxilia' }

/** Every entry ID a definition's own conditions name, at any depth. */
function childIds(definition: Definition): string[] {
  const found: string[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (typeof record.childId === 'string') found.push(record.childId)
    for (const key of ['modifiers', 'modifierGroups', 'conditions', 'conditionGroups', 'localConditionGroups']) visit(record[key])
  }
  visit({ modifiers: definition.modifiers, modifierGroups: definition.modifierGroups })
  return found
}

function readRelease(directory: string) {
  const read = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))
  const entries = z.object({ entries: z.array(entrySchema) }).parse(read('identity.json')).entries
  const names = new Map(entries.map((entry) => [entry.id, entry.name ?? '']))
  const records = new Map(
    manifestSchema
      .parse(read('manifest.json'))
      .categories.flatMap((category) => category.records)
      .filter((record) => record.kind === 'detachment')
      .map((record) => [record.id, detachmentSchema.parse(read(record.path)).data] as const),
  )
  const current = entries.filter((entry) => !entry.retired)
  const currentIds = new Set(current.map((entry) => entry.id))
  // A retired unit with one current successor, such as a datasheet a release revives under a new ID, reads as it.
  const successor = (entry: z.infer<typeof entrySchema>) => {
    const next = entry.retired?.replacedBy
    return next?.length === 1 && currentIds.has(next[0]!) ? next[0] : undefined
  }
  // A release can name a Detachment it has no record for; its ID starts with its faction's.
  const detachments: VsDetachment[] = current
    .filter((entry) => entry.kind === 'detachment')
    .map((entry) => ({ id: entry.id, name: entry.name ?? '', faction: entry.id.split('.')[0]!, ...records.get(entry.id) }))
  // Current units last, so an alias a current unit carries wins over a retired one's successor.
  const units = new Map(
    entries
      .filter((entry) => entry.kind === 'unit')
      .toSorted((left, right) => Number(!left.retired) - Number(!right.retired))
      .flatMap((entry) => {
        const id = entry.retired ? successor(entry) : entry.id
        return id
          ? (entry.aliases ?? [])
              .filter((alias) => alias.startsWith('bsdata.'))
              .map((alias) => [alias.slice(7).replaceAll('.', '-'), id] as const)
          : []
      }),
  )
  const unitNames = groupBy(
    current.filter((entry) => entry.kind === 'unit'),
    (entry) => same(entry.name ?? ''),
  )
  return {
    factions: new Set(current.filter((entry) => entry.kind === 'faction').map((entry) => entry.id)),
    names,
    detachments,
    units,
    unitNames,
  }
}

const SECTIONS = ['books', 'detachments', 'units', 'enhancements'] as const
type Section = (typeof SECTIONS)[number]
const found = Object.fromEntries(SECTIONS.map((section) => [section, [] as (readonly [string, string])[]])) as Record<
  Section,
  (readonly [string, string])[]
>
const missing = new Set<string>()
const byName = new Set<string>()
const composition = readCatalogueComposition(catalogueDirectory)
if (!composition) throw new Error(`${catalogueDirectory} has no catalogue composition`)
let base: Record<Section, Map<string, string>> | undefined
// The base first: a retained rules version adds `<version>~<id>` only where it reads an ID otherwise.
for (const entry of composition.editions.toSorted((left, right) => Number(Boolean(right.base)) - Number(Boolean(left.base)))) {
  const release = path.join(releases, entry.edition.id)
  if (!fs.existsSync(release)) {
    // Without the base, a retained rules version would be frozen as the current one.
    if (entry.base) throw new Error(`${entry.edition.id} is the base rules version; its release is required`)
    console.log(`${entry.edition.id}: no release, skipped`)
    continue
  }
  const vs = readRelease(release)
  const loaded = loadCatalogue(editionDirectory(catalogueDirectory, entry), entry.edition)
  if (!loaded) throw new Error(`${entry.edition.id} has no catalogue`)
  const { index } = loaded
  // A release whose app build predates a chapter's own faction plays that chapter's book as Space Marines.
  const factionOfBook = (bookId: string) => {
    const faction = BOOKS[bookId]
    return faction && CHAPTERS.has(faction) && !vs.factions.has(faction) ? 'space-marines' : faction
  }
  const read = Object.fromEntries(SECTIONS.map((section) => [section, new Map<string, string>()])) as Record<Section, Map<string, string>>
  const add = (section: Section, id: string, current: string) => {
    const held = read[section].get(id)
    if (held !== undefined && held !== current)
      throw new Error(`${entry.edition.id}: ${section} ${id} reads as both ${held} and ${current}`)
    read[section].set(id, current)
  }
  // Which factions each catalogue serves: its own book's, and those of every book that links it, however indirectly.
  const links = new Map(
    (loaded.definitions?.files ?? []).flatMap(({ file }) =>
      file.catalogue ? [[file.catalogue.id, (file.catalogue.catalogueLinks ?? []).map((link) => link.targetId)] as const] : [],
    ),
  )
  const linked = (id: string) => {
    const seen = new Set([id])
    for (const at of seen) for (const next of links.get(at) ?? []) seen.add(next)
    return seen
  }
  const served = new Map<string, Set<string>>()
  const optionDetachments = new Map<string, string>()
  const factionsOf = new Map<string, Set<string>>()
  for (const book of index.catalogues.values()) {
    const faction = factionOfBook(book.id.slice(book.id.indexOf('~') + 1))
    if (faction)
      for (const source of linked(book.id.slice(book.id.indexOf('~') + 1)))
        factionsOf.set(source, new Set([...(factionsOf.get(source) ?? []), faction]))
  }
  // A datasheet VS Data aliases under another entry, such as an ally's copy, is the one unit of its exact name, among the
  // factions its entry's book serves where several share it.
  const unitNamed = (name: string, entryId: string) => {
    const named = vs.unitNames.get(same(name.replace(/\s*\[(?:legends|crucible)\]\s*$/i, ''))) ?? []
    const owner = index.catalogueOf.get(entryId) ?? ''
    const factions = factionsOf.get(owner.slice(owner.indexOf('~') + 1)) ?? new Set()
    const unit = [named, named.filter((candidate) => factions.has(candidate.id.split('.')[0]!))].find(
      (matches) => matches.length === 1,
    )?.[0]?.id
    if (unit) byName.add(`${entry.edition.id} ${name} -> ${unit}`)
    return unit
  }
  for (const book of index.catalogues.values()) {
    if (book.library || book.gameSystem) continue
    // A retained rules version's books carry its ID as a prefix, which a saved roster keeps too.
    const bookId = book.id.slice(book.id.indexOf('~') + 1)
    const faction = factionOfBook(bookId)
    if (!faction) throw new Error(`${entry.edition.id}: book ${bookId} (${book.name}) has no faction in BOOKS`)
    // A retained rules version saves lists only for its own books; the rest serve allies, and need not be factions.
    if (vs.factions.has(faction)) add('books', bookId, faction)
    else if (entry.base || entry.edition.catalogueIds.includes(bookId))
      throw new Error(`${entry.edition.id}: ${faction} is not a faction of its release`)
    for (const datasheet of index.datasheets.get(book.id) ?? []) {
      const definition = index.definitions.get(datasheet)!
      const target = targetOf(definition, index.definitions)
      const unit = vs.units.get(datasheet) ?? vs.units.get(target.id) ?? unitNamed(nameOf(definition, index.definitions), target.id)
      if (unit) add('units', datasheet, unit)
      else missing.add(`${entry.edition.id} unit ${datasheet} ${nameOf(definition, index.definitions)}`)
    }
    // Only a book a list can be saved for in this rules version holds Detachments and Enhancements a list can name.
    if (!entry.base && !entry.edition.catalogueIds.includes(bookId)) continue
    const owners = [...new Set(CHAPTERS.has(faction) ? [faction, 'space-marines'] : [faction])]
    for (const source of linked(bookId)) served.set(source, new Set([...(served.get(source) ?? []), ...owners]))
    for (const option of loaded.detachments.get(book.id)?.options ?? []) {
      const printed = same(DETACHMENT_SPELLINGS[option.name] ?? option.name)
      const named = vs.detachments.filter((candidate) => same(candidate.name) === printed)
      const detachment = [...owners.map((owner) => named.filter((candidate) => candidate.faction === owner)), named].find(
        (matches) => matches.length,
      )
      if (detachment?.length !== 1) {
        missing.add(`${entry.edition.id} detachment ${book.name}: ${option.name} (${detachment?.length ?? 0} matches)`)
        continue
      }
      add('detachments', option.id, detachment[0]!.id)
      optionDetachments.set(option.id, detachment[0]!.id)
    }
  }
  // Under a Detachment of a faction its book serves, an upgrade is the Enhancement of that name the Detachment offers,
  // when BSData marks it as one: it costs an Enhancement (some cost none), sits in an Enhancements group, or shows only
  // with that Detachment. A weapon that shares an Enhancement's name is none of these. One entry can serve several
  // Detachments VS Data records apart, so a key names the Detachment.
  const enhancementCost = [...index.costTypes.values()].find((type) => type.name === 'Enhancements')?.id
  const parents = new Map<string, string[]>()
  for (const definition of index.definitions.values())
    for (const child of [
      ...(definition.selectionEntries ?? []),
      ...(definition.selectionEntryGroups ?? []),
      ...(definition.entryLinks ?? []),
    ])
      parents.set(child.id, [...(parents.get(child.id) ?? []), definition.id])
  const inEnhancementGroup = (id: string) => {
    for (let frontier = parents.get(id) ?? [], depth = 0; frontier.length && depth < 3; depth++) {
      if (frontier.some((at) => /enhancement/i.test(index.definitions.get(at)?.name ?? ''))) return true
      frontier = frontier.flatMap((at) => parents.get(at) ?? [])
    }
    return false
  }
  const offered = groupBy(
    vs.detachments.flatMap((detachment) =>
      (detachment.enhancements ?? []).map((enhancement) => ({
        detachment,
        enhancement,
        name: enhancementName(vs.names.get(enhancement) ?? ''),
      })),
    ),
    (offer) => offer.name,
  )
  for (const definition of index.definitions.values()) {
    const upgrade = targetOf(definition, index.definitions)
    if (upgrade.type !== 'upgrade' || !upgrade.name) continue
    const owner = index.catalogueOf.get(upgrade.id) ?? ''
    const factions = served.get(owner.slice(owner.indexOf('~') + 1))
    if (!factions) continue
    const marked = upgrade.costs?.some((cost) => cost.typeId === enhancementCost) || inEnhancementGroup(definition.id)
    const gated = new Set([...childIds(definition), ...childIds(upgrade)].flatMap((id) => optionDetachments.get(id) ?? []))
    const offers = (offered.get(enhancementName(SPELLINGS[upgrade.name] ?? upgrade.name)) ?? []).filter(
      (offer) => factions.has(offer.detachment.faction) && (marked || gated.has(offer.detachment.id)),
    )
    for (const { detachment, enhancement } of offers) add('enhancements', `${detachment.id}/${definition.id}`, enhancement)
  }
  const mapped = new Set(read.enhancements.values())
  for (const detachment of new Set(read.detachments.values()))
    for (const enhancement of vs.detachments.find((candidate) => candidate.id === detachment)?.enhancements ?? [])
      if (!mapped.has(enhancement)) missing.add(`${entry.edition.id} enhancement ${enhancement} has no entry`)
  // A saved ID the catalogue retired reads as its replacement: in the base through the retired-ID and migration maps,
  // in a retained rules version through its own aliases.
  const aliases = retainedRules.find((rule) => rule.editionId === entry.edition.id)?.aliases
  const replaced = (section: 'books' | 'detachments' | 'units', id: string) =>
    aliases
      ? { books: aliases.catalogues, detachments: aliases.detachments, units: aliases.datasheets }[section][id]?.id
      : { books: currentCatalogueId, detachments: currentDetachmentId, units: currentEntryId }[section](id)
  const saved = aliases
    ? { books: Object.keys(aliases.catalogues), detachments: Object.keys(aliases.detachments), units: Object.keys(aliases.datasheets) }
    : { books: [...migratedCatalogueIds()], detachments: [...migratedCatalogueIds()], units: [...migratedCatalogueIds()] }
  for (const section of ['books', 'detachments', 'units'] as const)
    for (const id of saved[section]) {
      const replacement = replaced(section, id)
      const current = replacement && replacement !== id ? read[section].get(replacement.slice(replacement.indexOf('~') + 1)) : undefined
      if (current && !read[section].has(id)) read[section].set(id, current)
    }
  for (const section of SECTIONS)
    for (const [id, current] of read[section])
      if (!base) found[section].push([id, current])
      else if (base[section].get(id) !== current) found[section].push([`${entry.edition.id}~${id}`, current])
  base ??= read
  console.log(`${entry.edition.id}: read`)
}
console.log(`${byName.size} units matched by name`)
for (const line of [...byName].toSorted()) console.log(`  ${line}`)
console.log(`${missing.size} IDs without a VS Data match`)
for (const line of [...missing].toSorted()) console.log(`  ${line}`)
for (const section of SECTIONS) freezeLegacyIds(section, found[section], (frozen) => correctedIds(section, frozen, legacyIdCorrections))
