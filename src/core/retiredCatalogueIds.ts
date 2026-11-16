import { z } from 'zod'
import rawRetired from '../../catalogue/retired-ids.json' with { type: 'json' }
import rawMigrations from '../../catalogue/roster-migrations.json' with { type: 'json' }
import type { RosterPick } from './roster'
import { catalogueEditionId, editionCatalogueId, editionFamilyId, picksForCatalogueEdition } from './catalogueEdition'
import { editionMigrationDatasheets, foldedEditionIds, migratedEditionId, migratedEditionPick, onFoldedEdition } from './editionMigrations'
import { retainedRules, retainedRulesEdition, retainedRulesFor as retainedFor, retiredSourceSchema } from './retainedRosterRules'

const retired = Object.values(z.record(z.string(), retiredSourceSchema).parse(rawRetired))
const migrations = Object.values(
  z
    .record(
      z.string(),
      retiredSourceSchema.extend({
        fromSnapshot: z.string().regex(/^[a-f0-9]{64}$/),
        toSnapshot: z.string().regex(/^[a-f0-9]{64}$/),
        reason: z.string().min(1),
      }),
    )
    .parse(rawMigrations),
)
const migrationDatasheets = migrations.map((migration) => new Map(Object.entries(migration.datasheets)))
const migrationCatalogues = migrations.map((migration) => new Map(Object.entries(migration.catalogues)))
const migrationDetachments = migrations.map((migration) => new Map(Object.entries(migration.detachments)))

/**
 * Every saved ID one of the maps reads as something else: a book, detachment or datasheet, a saved option, or
 * a segment of a saved choice or toggle key. A snapshot that drops one of these has already been handled.
 */
export function migratedCatalogueIds() {
  const ids = new Set<string>()
  const addPath = (key: string) => key.split('/').forEach((segment) => ids.add(segment))
  const sources = [...retired, ...migrations, ...retainedRules.map((rule) => rule.aliases)]
  for (const source of sources) {
    for (const id of [...Object.keys(source.catalogues), ...Object.keys(source.detachments)]) ids.add(id)
  }
  const sheets: [string, Partial<z.infer<typeof retiredSourceSchema>['datasheets'][string]>][] = [
    ...sources.flatMap((source) => Object.entries(source.datasheets)),
    ...editionMigrationDatasheets.flatMap((datasheets) => Object.entries(datasheets)),
  ]
  for (const [entryId, sheet] of sheets) {
    ids.add(entryId)
    for (const [key, options] of Object.entries(sheet.choices ?? {})) {
      addPath(key)
      for (const id of Object.keys(options)) ids.add(id)
    }
    for (const key of Object.keys(sheet.toggles ?? {})) addPath(key)
    for (const [key, options] of Object.entries(sheet.fixedChoices ?? {})) {
      addPath(key)
      options.forEach((id) => ids.add(id))
    }
  }
  return ids
}

const catalogues = new Map(retired.flatMap((source) => Object.entries(source.catalogues)))
const detachments = new Map(retired.flatMap((source) => Object.entries(source.detachments)))
const datasheets = new Map(retired.flatMap((source) => Object.entries(source.datasheets)))

/** Saved ids from a retired source move to the current record verified by name and faction; any other id is kept. */
export const currentCatalogueId = (id: string) =>
  migrationCatalogues.reduce((current, map) => map.get(current)?.id ?? current, catalogues.get(id)?.id ?? id)
export const currentCatalogueFamilyId = (id: string) => currentCatalogueId(editionFamilyId(id))

export function picksForRulesVersion<T extends RosterPick>(picks: readonly T[], catalogueId: string): T[] {
  if (retainedFor(catalogueId)) return picksForCatalogueEdition(picks, catalogueId)
  const current = picks.map((pick) => ({
    ...pick,
    ...currentPick({
      ...pick,
      ...(pick.catalogueId ? { catalogueId: currentCatalogueFamilyId(pick.catalogueId) } : {}),
    }),
  }))
  return picksForCatalogueEdition(current, catalogueId)
}
export const currentDetachmentId = (id: string, catalogueId = '') =>
  catalogueEditionId(catalogueId)
    ? (retainedFor(catalogueId)?.aliases.detachments[id]?.id ?? id)
    : migrationDetachments.reduce((current, map) => map.get(current)?.id ?? current, detachments.get(id)?.id ?? id)
/**
 * These IDs and every retired one `currentCatalogueId` replaces with one of them. A roster that
 * `currentRosterIds` moves to a retained rules version by its contents is not found here.
 */
export function savedCatalogueIds(current: readonly string[]) {
  const wanted = new Set(current)
  const saved = new Set(current)
  for (const id of [...catalogues.keys(), ...migrationCatalogues.flatMap((map) => [...map.keys()])])
    if (wanted.has(currentCatalogueId(id))) saved.add(id)
  for (const id of [...saved].flatMap((book) => foldedEditionIds(book))) saved.add(id)
  return [...saved]
}

/** Every saved detachment ID that `currentRosterIds` can read as one of these, the IDs themselves included. */
export function savedDetachmentIds(current: readonly string[]) {
  const wanted = new Set(current)
  const saved = new Set(current)
  for (const id of [...detachments.keys(), ...migrationDetachments.flatMap((map) => [...map.keys()])])
    if (wanted.has(currentDetachmentId(id))) saved.add(id)
  for (const rule of retainedRules)
    for (const [id, replacement] of Object.entries(rule.aliases.detachments)) if (wanted.has(replacement.id)) saved.add(id)
  return [...saved]
}
export const currentEntryId = (id: string, catalogueId = '') =>
  catalogueEditionId(catalogueId)
    ? id
    : migrationDatasheets.reduce((current, map) => map.get(current)?.id ?? current, datasheets.get(id)?.id ?? id)

/** A saved option moves only with a one-to-one match on its datasheet; the rest keep their keys for pricing to report. */
export function currentPick(pick: RosterPick, catalogueId = ''): RosterPick {
  if (catalogueEditionId(catalogueId) || (pick.catalogueId && catalogueEditionId(pick.catalogueId))) {
    const aliases = retainedFor(catalogueId)?.aliases.datasheets
    return aliases ? mappedPick(pick, new Map(Object.entries(aliases))) : pick
  }
  return migrationDatasheets.reduce((current, sheets) => mappedPick(current, sheets), mappedPick(pick, datasheets))
}

function mappedPick(pick: RosterPick, sheets: typeof datasheets): RosterPick {
  const allied = pick.catalogueId ? { catalogueId: currentCatalogueId(pick.catalogueId) } : {}
  const sheet = sheets.get(pick.entryId)
  if (!sheet) return { ...pick, ...allied }
  const option = (key: string, id: string) => sheet.choices?.[key]?.[id] ?? { key, id }
  const spreads: NonNullable<RosterPick['spreads']> = {}
  const spread = (key: string, id: string, count: number) => {
    spreads[key] = { ...spreads[key], [id]: (spreads[key]?.[id] ?? 0) + count }
  }
  for (const [key, counts] of Object.entries(pick.spreads ?? {})) {
    for (const [id, count] of Object.entries(counts)) {
      const current = option(key, id)
      spread(current.key, current.id, count)
    }
  }
  const counted = Object.entries(pick.choices ?? {}).filter(([key, id]) => option(key, id).count)
  for (const [key, id] of counted) spread(option(key, id).key, option(key, id).id, option(key, id).count!)
  const parents: Record<string, string> = Object.assign({}, ...Object.entries(pick.choices ?? {}).map(([key, id]) => option(key, id).with))
  return {
    ...pick,
    ...allied,
    entryId: sheet.id,
    ...(pick.choices
      ? {
          choices: Object.fromEntries(
            [...Object.entries(parents).filter(([key]) => !pick.choices?.[key]), ...Object.entries(pick.choices)]
              .filter(([key, id]) => !sheet.fixedChoices?.[key]?.includes(id) && !option(key, id).count)
              .map(([key, id]) => {
                const current = option(key, id)
                const existing = pick.choices?.[current.key]
                return existing && current.key !== key && option(current.key, existing).id !== current.id
                  ? [key, id]
                  : [current.key, current.id]
              }),
          ),
        }
      : {}),
    ...(pick.spreads || counted.length ? { spreads } : {}),
    ...(pick.toggles
      ? { toggles: Object.fromEntries(Object.entries(pick.toggles).map(([key, on]) => [sheet.toggles?.[key] ?? key, on])) }
      : {}),
  }
}

/** A saved list read against current ids. */
export function currentRosterIds<
  T extends {
    catalogueId: string
    detachmentIds: readonly string[]
    borrowedDetachmentId?: string | null
    picks?: readonly RosterPick[]
    units?: readonly RosterPick[]
    updatedAt?: number
  },
>(roster: T, folded = false): T {
  // A fold bypasses historical-rule detection for this pass; its unqualified target no longer carries that provenance.
  if (onFoldedEdition(roster.catalogueId))
    return currentRosterIds(
      {
        ...roster,
        catalogueId: migratedEditionId(roster.catalogueId),
        ...(roster.picks ? { picks: roster.picks.map((pick) => migratedEditionPick(pick, roster.catalogueId)) } : {}),
        ...(roster.units ? { units: roster.units.map((pick) => migratedEditionPick(pick, roster.catalogueId)) } : {}),
      },
      true,
    )
  const retained = folded ? null : retainedRulesEdition(roster)
  if (retained) {
    const catalogueId = editionCatalogueId(retained, roster.catalogueId)
    return currentRosterIds({
      ...roster,
      catalogueId,
      ...(roster.picks ? { picks: picksForCatalogueEdition(roster.picks, catalogueId) } : {}),
      ...(roster.units ? { units: picksForCatalogueEdition(roster.units, catalogueId) } : {}),
    })
  }
  return idsWithinRulesVersion(roster)
}

type RosterIds = Parameters<typeof currentRosterIds>[0]

/**
 * A list a battle or sealed event froze, read on the rules version it was fielded under: retired ids still
 * resolve, but a version that later folded into another is not moved onto it.
 */
export const fieldedRosterIds = <T extends RosterIds>(roster: T): T =>
  catalogueEditionId(roster.catalogueId) ? idsWithinRulesVersion(roster) : currentRosterIds(roster)

function idsWithinRulesVersion<T extends RosterIds>(roster: T): T {
  return {
    ...roster,
    catalogueId: currentCatalogueId(roster.catalogueId),
    detachmentIds: roster.detachmentIds.map((id) => currentDetachmentId(id, roster.catalogueId)),
    ...(roster.borrowedDetachmentId ? { borrowedDetachmentId: currentDetachmentId(roster.borrowedDetachmentId, roster.catalogueId) } : {}),
    ...(roster.picks ? { picks: roster.picks.map((pick) => currentPick(pick, roster.catalogueId)) } : {}),
    ...(roster.units ? { units: roster.units.map((pick) => currentPick(pick, roster.catalogueId)) } : {}),
  }
}
