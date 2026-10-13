import { z } from 'zod'
import rawRetired from '../../.catalogue-authoring/catalogue/retired-ids.json' with { type: 'json' }
import rawRetainedRules from '../../.catalogue-authoring/catalogue/retained-roster-rules.json' with { type: 'json' }
import rawMigrations from '../../.catalogue-authoring/catalogue/roster-migrations.json' with { type: 'json' }
import type { RosterPick } from './roster'
import { catalogueEditionId, editionCatalogueId, editionFamilyId, picksForCatalogueEdition } from './catalogueEdition'

const replacementSchema = z.object({ id: z.string() })
const optionSchema = z.object({ key: z.string(), id: z.string() })
const retiredSourceSchema = z.object({
  catalogues: z.record(z.string(), replacementSchema),
  detachments: z.record(z.string(), replacementSchema),
  datasheets: z.record(
    z.string(),
    replacementSchema.extend({
      choices: z.record(z.string(), z.record(z.string(), optionSchema)).optional(),
      toggles: z.record(z.string(), z.string()).optional(),
    }),
  ),
})
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
const retainedRules = z
  .array(
    z.object({
      editionId: z.string(),
      catalogueIds: z.array(z.string()),
      originalCatalogueIds: z.array(z.string()),
      detachments: z.array(z.string()),
      selectionGroups: z.array(
        z.array(
          z.object({ entryId: z.string(), kind: z.enum(['choice', 'spread', 'toggle']), key: z.string(), optionId: z.string().optional() }),
        ),
      ),
      aliases: retiredSourceSchema,
    }),
  )
  .parse(rawRetainedRules)
const retainedFor = (catalogueId: string) => retainedRules.find((rule) => rule.editionId === catalogueEditionId(catalogueId))
const migrationDatasheets = migrations.map((migration) => new Map(Object.entries(migration.datasheets)))
const migrationCatalogues = migrations.map((migration) => new Map(Object.entries(migration.catalogues)))
const migrationDetachments = migrations.map((migration) => new Map(Object.entries(migration.detachments)))

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
  for (const [key, counts] of Object.entries(pick.spreads ?? {})) {
    for (const [id, count] of Object.entries(counts)) {
      const current = option(key, id)
      spreads[current.key] = { ...spreads[current.key], [current.id]: (spreads[current.key]?.[current.id] ?? 0) + count }
    }
  }
  return {
    ...pick,
    ...allied,
    entryId: sheet.id,
    ...(pick.choices
      ? {
          choices: Object.fromEntries(
            Object.entries(pick.choices).map(([key, id]) => {
              const current = option(key, id)
              const existing = pick.choices?.[current.key]
              return existing && current.key !== key && option(current.key, existing).id !== current.id
                ? [key, id]
                : [current.key, current.id]
            }),
          ),
        }
      : {}),
    ...(pick.spreads ? { spreads } : {}),
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
  },
>(roster: T): T {
  const retained =
    !catalogueEditionId(roster.catalogueId) &&
    retainedRules.find(
      (rule) =>
        rule.catalogueIds.includes(roster.catalogueId) &&
        (rule.originalCatalogueIds.includes(roster.catalogueId) ||
          roster.detachmentIds.some((id) => rule.detachments.includes(id)) ||
          (roster.borrowedDetachmentId && rule.detachments.includes(roster.borrowedDetachmentId)) ||
          (rule.selectionGroups.length > 0 &&
            rule.selectionGroups.every((group) =>
              group.some((selection) =>
                [...(roster.picks ?? []), ...(roster.units ?? [])].some(
                  (pick) =>
                    pick.entryId === selection.entryId &&
                    (selection.kind === 'choice'
                      ? pick.choices?.[selection.key] === selection.optionId
                      : selection.kind === 'spread'
                        ? (pick.spreads?.[selection.key]?.[selection.optionId!] ?? 0) > 0
                        : (pick.toggles?.[selection.key] ?? 0) > 0),
                ),
              ),
            ))),
    )
  if (retained) {
    const catalogueId = editionCatalogueId(retained.editionId, roster.catalogueId)
    return currentRosterIds({
      ...roster,
      catalogueId,
      ...(roster.picks ? { picks: picksForCatalogueEdition(roster.picks, catalogueId) } : {}),
      ...(roster.units ? { units: picksForCatalogueEdition(roster.units, catalogueId) } : {}),
    })
  }
  return {
    ...roster,
    catalogueId: currentCatalogueId(roster.catalogueId),
    detachmentIds: roster.detachmentIds.map((id) => currentDetachmentId(id, roster.catalogueId)),
    ...(roster.borrowedDetachmentId ? { borrowedDetachmentId: currentDetachmentId(roster.borrowedDetachmentId, roster.catalogueId) } : {}),
    ...(roster.picks ? { picks: roster.picks.map((pick) => currentPick(pick, roster.catalogueId)) } : {}),
    ...(roster.units ? { units: roster.units.map((pick) => currentPick(pick, roster.catalogueId)) } : {}),
  }
}
