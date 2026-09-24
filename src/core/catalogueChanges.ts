import { z } from 'zod'
import { routeSlug } from './slug'
import { compareText } from './text'

/**
 * What one army-data update changed, between the reference data two snapshots state.
 *
 * Everything is matched by the identity the data gives it: a datasheet or a detachment
 * by its catalogue and entry id, a points row by its model count and the conditions
 * printed beside it, and an enhancement by its exact name inside the detachment that
 * offers it. Whatever cannot be matched that way is reported as removed and added
 * rather than paired up as a change, and names alone are never joined.
 */

type PointsRow = { models: string; cost: string; keyword: string | null; faction: string | null; detachment: string | null }
type PricedOption = { name: string; points: number | null }

/** The part of a compiled reference catalogue a change set is read from. */
export type ChangeSource = {
  datasheets: readonly {
    catalogueId: string
    faction: string
    id: string
    name: string
    points: number | null
    costs: readonly PointsRow[]
  }[]
  detachments: readonly {
    catalogueId: string
    faction: string
    id: string
    name: string
    points: number | null
    enhancements: readonly PricedOption[]
    upgrades: readonly PricedOption[]
  }[]
}

/** Points as the source prints them; null is a row or a price the source does not state. */
type Points = string | null

export type PointsRowChange = {
  /** The model count, named only when the datasheet prints more than one row. */
  models: string | null
  /** The keyword, faction or detachment a row applies under, when the source prints one. */
  condition: string | null
  from: Points
  to: Points
}

export type CatalogueChange =
  | { kind: 'datasheet-points'; id: string; name: string; rows: PointsRowChange[] }
  | { kind: 'datasheet-added' | 'datasheet-removed'; id: string; name: string }
  | { kind: 'detachment-points'; id: string; name: string; from: Points; to: Points }
  | { kind: 'detachment-added' | 'detachment-removed'; id: string; name: string }
  | { kind: 'enhancement-points'; detachmentId: string; detachment: string; name: string; upgrade: boolean; from: Points; to: Points }
  | { kind: 'enhancement-added' | 'enhancement-removed'; detachmentId: string; detachment: string; name: string; upgrade: boolean }

export type FactionChanges = { catalogueId: string; faction: string; changes: CatalogueChange[] }

export type CatalogueChangeSet = {
  factions: FactionChanges[]
  /** Changes past the size bound, counted so a reader knows the list is not the whole of it. */
  omitted: number
}

/** Enough for any points update; a whole new edition is summarised rather than stored whole. */
export const CATALOGUE_CHANGE_LIMIT = 2000

const pointsSchema = z.string().nullable()
const datasheetIdentity = { id: z.string(), name: z.string() }
const optionIdentity = { detachmentId: z.string(), detachment: z.string(), name: z.string(), upgrade: z.boolean() }

const changeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('datasheet-points'),
    ...datasheetIdentity,
    rows: z
      .array(z.object({ models: z.string().nullable(), condition: z.string().nullable(), from: pointsSchema, to: pointsSchema }))
      .min(1),
  }),
  z.object({ kind: z.literal('datasheet-added'), ...datasheetIdentity }),
  z.object({ kind: z.literal('datasheet-removed'), ...datasheetIdentity }),
  z.object({ kind: z.literal('detachment-points'), ...datasheetIdentity, from: pointsSchema, to: pointsSchema }),
  z.object({ kind: z.literal('detachment-added'), ...datasheetIdentity }),
  z.object({ kind: z.literal('detachment-removed'), ...datasheetIdentity }),
  z.object({ kind: z.literal('enhancement-points'), ...optionIdentity, from: pointsSchema, to: pointsSchema }),
  z.object({ kind: z.literal('enhancement-added'), ...optionIdentity }),
  z.object({ kind: z.literal('enhancement-removed'), ...optionIdentity }),
])

export const catalogueChangeSetSchema: z.ZodType<CatalogueChangeSet> = z.object({
  factions: z.array(z.object({ catalogueId: z.string(), faction: z.string(), changes: z.array(changeSchema) })),
  omitted: z.number().int().nonnegative(),
})

const KIND_ORDER: CatalogueChange['kind'][] = [
  'datasheet-points',
  'datasheet-removed',
  'datasheet-added',
  'detachment-points',
  'detachment-removed',
  'detachment-added',
  'enhancement-points',
  'enhancement-removed',
  'enhancement-added',
]

const key = (...parts: readonly (string | null)[]) => JSON.stringify(parts)
const pointsOf = (value: number | null): Points => (value === null ? null : String(value))

/**
 * Records keyed by their identity, with every record whose identity another shares set
 * aside: two different records claiming one identity cannot be paired with anything.
 * Exact repeats are one record said twice and collapse.
 */
function byIdentity<T>(records: readonly T[], identity: (record: T) => string, same: (record: T) => string) {
  const grouped = new Map<string, T[]>()
  for (const record of records) grouped.set(identity(record), [...(grouped.get(identity(record)) ?? []), record])
  const unique = new Map<string, T>()
  const ambiguous: T[] = []
  for (const [id, group] of grouped) {
    if (new Set(group.map(same)).size === 1) unique.set(id, group[0]!)
    else ambiguous.push(...group)
  }
  return { unique, ambiguous }
}

/** Each identity's distinct prices on both sides, compared only where both state exactly one. */
function pricedChanges<T>(
  before: readonly T[],
  after: readonly T[],
  identity: (record: T) => string,
  price: (record: T) => Points,
): { identity: string; record: T; from: Points; to: Points }[] {
  const pricesOf = (records: readonly T[]) => {
    const found = new Map<string, { record: T; prices: Set<Points> }>()
    for (const record of records) {
      const entry = found.get(identity(record)) ?? { record, prices: new Set<Points>() }
      entry.prices.add(price(record))
      found.set(identity(record), entry)
    }
    return found
  }
  const old = pricesOf(before)
  const next = pricesOf(after)
  const changes: { identity: string; record: T; from: Points; to: Points }[] = []
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const was = old.get(id)
    const is = next.get(id)
    const record = (is ?? was)!.record
    if (was && is && was.prices.size === 1 && is.prices.size === 1) {
      const [from] = was.prices
      const [to] = is.prices
      if (from !== to) changes.push({ identity: id, record, from: from!, to: to! })
      continue
    }
    for (const from of was?.prices ?? []) if (!is?.prices.has(from)) changes.push({ identity: id, record, from, to: null })
    for (const to of is?.prices ?? []) if (!was?.prices.has(to)) changes.push({ identity: id, record, from: null, to })
  }
  return changes
}

type Datasheet = ChangeSource['datasheets'][number]
type Detachment = ChangeSource['detachments'][number]

/** A datasheet without a points table prints one price, which is its only row. */
const rowsOf = (sheet: Datasheet): PointsRow[] =>
  sheet.costs.length
    ? [...sheet.costs]
    : sheet.points === null
      ? []
      : [{ models: '', cost: String(sheet.points), keyword: null, faction: null, detachment: null }]

const rowIdentity = (row: PointsRow) => key(row.models, row.keyword, row.faction, row.detachment)
const rowCondition = (row: PointsRow) => [row.keyword, row.faction, row.detachment].filter(Boolean).join(', ') || null

function datasheetChanges(before: Datasheet, after: Datasheet): CatalogueChange[] {
  const old = rowsOf(before)
  const next = rowsOf(after)
  const named = old.length > 1 || next.length > 1
  const rows = pricedChanges(old, next, rowIdentity, (row) => row.cost)
    .map(({ record, from, to }) => ({ models: named && record.models ? record.models : null, condition: rowCondition(record), from, to }))
    .toSorted((left, right) => compareModels(left.models, right.models) || compareText(left.condition ?? '', right.condition ?? ''))
  return rows.length ? [{ kind: 'datasheet-points', id: after.id, name: after.name, rows }] : []
}

const compareModels = (left: string | null, right: string | null) =>
  (Number.parseInt(left ?? '', 10) || 0) - (Number.parseInt(right ?? '', 10) || 0) || compareText(left ?? '', right ?? '')

function detachmentChanges(before: Detachment, after: Detachment): CatalogueChange[] {
  const changes: CatalogueChange[] = []
  if (before.points !== after.points) {
    changes.push({ kind: 'detachment-points', id: after.id, name: after.name, from: pointsOf(before.points), to: pointsOf(after.points) })
  }
  const optionsOf = (detachment: Detachment) => [
    ...detachment.enhancements.map((option) => ({ ...option, upgrade: false })),
    ...detachment.upgrades.map((option) => ({ ...option, upgrade: true })),
  ]
  const optionKey = (option: PricedOption & { upgrade: boolean }) => key(option.upgrade ? 'upgrade' : 'enhancement', option.name)
  const old = optionsOf(before)
  const next = optionsOf(after)
  const oldNames = new Set(old.map(optionKey))
  const nextNames = new Set(next.map(optionKey))
  const option = { detachmentId: after.id, detachment: after.name }
  for (const { identity, record, from, to } of pricedChanges(old, next, optionKey, (entry) => pointsOf(entry.points))) {
    const base = { ...option, name: record.name, upgrade: record.upgrade }
    if (!nextNames.has(identity)) changes.push({ kind: 'enhancement-removed', ...base })
    else if (!oldNames.has(identity)) changes.push({ kind: 'enhancement-added', ...base })
    else changes.push({ kind: 'enhancement-points', ...base, from, to })
  }
  return changes
}

function compared<T extends { catalogueId: string; faction: string; id: string; name: string }>(
  before: readonly T[],
  after: readonly T[],
  same: (record: T) => string,
  changed: (before: T, after: T) => CatalogueChange[],
  kinds: { added: 'datasheet-added' | 'detachment-added'; removed: 'datasheet-removed' | 'detachment-removed' },
) {
  const identity = (record: T) => key(record.catalogueId, record.id)
  const old = byIdentity(before, identity, same)
  const next = byIdentity(after, identity, same)
  const found: { record: T; change: CatalogueChange }[] = []
  for (const [id, record] of old.unique) {
    const now = next.unique.get(id)
    if (now) found.push(...changed(record, now).map((change) => ({ record: now, change })))
    else found.push({ record, change: { kind: kinds.removed, id: record.id, name: record.name } })
  }
  for (const [id, record] of next.unique)
    if (!old.unique.has(id)) found.push({ record, change: { kind: kinds.added, id: record.id, name: record.name } })
  for (const record of old.ambiguous) found.push({ record, change: { kind: kinds.removed, id: record.id, name: record.name } })
  for (const record of next.ambiguous) found.push({ record, change: { kind: kinds.added, id: record.id, name: record.name } })
  return found
}

const changeName = (change: CatalogueChange) => ('detachment' in change ? `${change.detachment}\0${change.name}` : change.name)
const changeId = (change: CatalogueChange) => ('detachmentId' in change ? change.detachmentId : change.id)

/**
 * The change set between two snapshots' reference data, in one deterministic order:
 * factions by name, then each faction's changes by kind and name. The same two inputs
 * always give byte-identical output, which is what lets any replica record it.
 */
export function catalogueChanges(before: ChangeSource, after: ChangeSource, limit = CATALOGUE_CHANGE_LIMIT): CatalogueChangeSet {
  const found = [
    ...compared(before.datasheets, after.datasheets, (sheet) => JSON.stringify([sheet.name, sheet.points, sheet.costs]), datasheetChanges, {
      added: 'datasheet-added',
      removed: 'datasheet-removed',
    }),
    ...compared(
      before.detachments,
      after.detachments,
      (detachment) => JSON.stringify([detachment.name, detachment.points, detachment.enhancements, detachment.upgrades]),
      detachmentChanges,
      { added: 'detachment-added', removed: 'detachment-removed' },
    ),
  ]
  const factions = new Map<string, FactionChanges>()
  const said = new Set<string>()
  for (const { record, change } of found) {
    const faction = factions.get(record.catalogueId) ?? { catalogueId: record.catalogueId, faction: record.faction, changes: [] }
    // A faction's name is the one the newer data gives it.
    if (change.kind !== 'datasheet-removed' && change.kind !== 'detachment-removed') faction.faction = record.faction
    // An option leaving with two prices, or two records sharing one id, is one fact said twice.
    const fact = key(record.catalogueId, JSON.stringify(change))
    if (!said.has(fact)) faction.changes.push(change)
    said.add(fact)
    factions.set(record.catalogueId, faction)
  }
  const ordered = [...factions.values()]
    .map((faction) => ({
      ...faction,
      changes: faction.changes.toSorted(
        (left, right) =>
          KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind) ||
          compareText(changeName(left), changeName(right)) ||
          compareText(changeId(left), changeId(right)),
      ),
    }))
    .toSorted((left, right) => compareText(left.faction, right.faction) || compareText(left.catalogueId, right.catalogueId))
  let room = limit
  const kept = ordered.flatMap((faction) => {
    const changes = faction.changes.slice(0, Math.max(room, 0))
    room -= changes.length
    return changes.length ? [{ ...faction, changes }] : []
  })
  const total = ordered.reduce((sum, faction) => sum + faction.changes.length, 0)
  return { factions: kept, omitted: total - kept.reduce((sum, faction) => sum + faction.changes.length, 0) }
}

export const isEmptyChangeSet = (changes: CatalogueChangeSet) => !changes.factions.length && !changes.omitted

/** What a saved list holds that a data update can change. */
export type ListContents = {
  catalogueId: string
  detachmentIds: readonly string[]
  datasheetIds: readonly string[]
  enhancements: readonly string[]
  upgrades: readonly string[]
}

export type RecordedChangeSet = { recordedAt: number; changes: CatalogueChangeSet }
export type ListChange = { recordedAt: number; catalogueId: string; faction: string; change: CatalogueChange }

/** Being there stands in for a value, so leaving and coming back fold like any other change. */
const PRESENT = '\0present'

/** One value moving for one item: a points row, a price, or whether the thing exists at all. */
type Fact = {
  item: string
  /** The change the fact is reported under; a datasheet's rows share one. */
  group: string
  row: Pick<PointsRowChange, 'models' | 'condition'> | null
  from: Points
  to: Points
  entry: ListChange
}

function factsOf(entry: ListChange): Fact[] {
  const { catalogueId, change } = entry
  const moving = (group: string, from: Points, to: Points, row: Fact['row'] = null): Fact => ({
    item: row ? key(group, row.models, row.condition) : group,
    group,
    row,
    from,
    to,
    entry,
  })
  const presence = (identity: string) =>
    change.kind.endsWith('-removed') ? moving(key(identity, 'presence'), PRESENT, null) : moving(key(identity, 'presence'), null, PRESENT)
  switch (change.kind) {
    case 'datasheet-points':
      return change.rows.map((row) => moving(key(catalogueId, 'datasheet', change.id, 'points'), row.from, row.to, row))
    case 'datasheet-added':
    case 'datasheet-removed':
      return [presence(key(catalogueId, 'datasheet', change.id))]
    case 'detachment-points':
      return [moving(key(catalogueId, 'detachment', change.id, 'points'), change.from, change.to)]
    case 'detachment-added':
    case 'detachment-removed':
      return [presence(key(catalogueId, 'detachment', change.id))]
    case 'enhancement-points':
      return [
        moving(key(catalogueId, 'option', change.detachmentId, String(change.upgrade), change.name, 'points'), change.from, change.to),
      ]
    default:
      return [presence(key(catalogueId, 'option', change.detachmentId, String(change.upgrade), change.name))]
  }
}

/** A folded group as the one change it adds up to, named as its newest update names it. */
function netChange(group: readonly Fact[]): ListChange {
  const latest = group.reduce((newest, fact) => (fact.entry.recordedAt > newest.entry.recordedAt ? fact : newest)).entry
  const { change } = latest
  const [first] = group
  switch (change.kind) {
    case 'datasheet-points':
      return {
        ...latest,
        change: { ...change, rows: group.map((fact) => ({ models: null, condition: null, ...fact.row, from: fact.from, to: fact.to })) },
      }
    case 'detachment-points':
    case 'enhancement-points':
      return { ...latest, change: { ...change, from: first!.from, to: first!.to } }
    case 'datasheet-added':
    case 'datasheet-removed':
      return { ...latest, change: { kind: 'datasheet-removed', id: change.id, name: change.name } }
    case 'detachment-added':
    case 'detachment-removed':
      return { ...latest, change: { kind: 'detachment-removed', id: change.id, name: change.name } }
    default: {
      const { detachmentId, detachment, name, upgrade } = change
      return { ...latest, change: { kind: 'enhancement-removed', detachmentId, detachment, name, upgrade } }
    }
  }
}

/**
 * What the data updates recorded since a list was last saved changed about the things it
 * holds, as one net change per item: from the value the oldest update found to the value
 * the newest left. An item that ends where it started drops out, a removal undone by a
 * later return included, and so does one that ends merely added, since a list holding it
 * held it all along. The banner on a list and the library's count both read this.
 *
 * A datasheet is matched by its entry id in any faction, since a list can field allies; a
 * detachment, and the enhancements it offers, only in the list's own book. An enhancement's
 * name is compared the way pricing joins it to the rules source.
 */
export function changesTouching(list: ListContents, savedAt: number, sets: readonly RecordedChangeSet[]): ListChange[] {
  const datasheets = new Set(list.datasheetIds)
  const detachments = new Set(list.detachmentIds)
  const held = (names: readonly string[]) => new Set(names.map(routeSlug))
  const enhancements = held(list.enhancements)
  const upgrades = held(list.upgrades)
  const touches = (catalogueId: string, change: CatalogueChange) => {
    if ('detachmentId' in change) {
      return (
        catalogueId === list.catalogueId &&
        detachments.has(change.detachmentId) &&
        (change.upgrade ? upgrades : enhancements).has(routeSlug(change.name))
      )
    }
    if (change.kind.startsWith('datasheet')) return datasheets.has(change.id)
    return catalogueId === list.catalogueId && detachments.has(change.id)
  }
  const facts = new Map<string, Fact>()
  for (const set of sets.filter((each) => each.recordedAt > savedAt).toSorted((left, right) => left.recordedAt - right.recordedAt)) {
    for (const faction of set.changes.factions) {
      for (const change of faction.changes) {
        if (!touches(faction.catalogueId, change)) continue
        const entry = { recordedAt: set.recordedAt, catalogueId: faction.catalogueId, faction: faction.faction, change }
        for (const fact of factsOf(entry)) {
          const earlier = facts.get(fact.item)
          facts.set(fact.item, earlier ? { ...fact, from: earlier.from } : fact)
        }
      }
    }
  }
  const groups = new Map<string, Fact[]>()
  for (const fact of facts.values()) {
    if (fact.from === fact.to || (fact.from === null && fact.to === PRESENT)) continue
    groups.set(fact.group, [...(groups.get(fact.group) ?? []), fact])
  }
  return [...groups.values()].map(netChange)
}
