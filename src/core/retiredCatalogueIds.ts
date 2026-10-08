import { z } from 'zod'
import rawRetired from '../../catalogue/retired-ids.json' with { type: 'json' }
import type { RosterPick } from './roster'

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

const catalogues = new Map(retired.flatMap((source) => Object.entries(source.catalogues)))
const detachments = new Map(retired.flatMap((source) => Object.entries(source.detachments)))
const datasheets = new Map(retired.flatMap((source) => Object.entries(source.datasheets)))

/** Saved ids from a retired source move to the current record verified by name and faction; any other id is kept. */
export const currentCatalogueId = (id: string) => catalogues.get(id)?.id ?? id
export const currentDetachmentId = (id: string) => detachments.get(id)?.id ?? id
export const currentEntryId = (id: string) => datasheets.get(id)?.id ?? id

/** A saved option moves only with a one-to-one match on its datasheet; the rest keep their keys for pricing to report. */
export function currentPick(pick: RosterPick): RosterPick {
  const allied = pick.catalogueId ? { catalogueId: currentCatalogueId(pick.catalogueId) } : {}
  const sheet = datasheets.get(pick.entryId)
  if (!sheet) return { ...pick, ...allied }
  const option = (key: string, id: string) => sheet.choices?.[key]?.[id] ?? { key, id }
  const spreads: NonNullable<RosterPick['spreads']> = {}
  for (const [key, counts] of Object.entries(pick.spreads ?? {})) {
    for (const [id, count] of Object.entries(counts)) {
      const current = option(key, id)
      spreads[current.key] = { ...spreads[current.key], [current.id]: count }
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
              return [current.key, current.id]
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
  T extends { catalogueId: string; detachmentIds: readonly string[]; borrowedDetachmentId?: string | null; picks?: readonly RosterPick[] },
>(roster: T): T {
  return {
    ...roster,
    catalogueId: currentCatalogueId(roster.catalogueId),
    detachmentIds: roster.detachmentIds.map(currentDetachmentId),
    ...(roster.borrowedDetachmentId ? { borrowedDetachmentId: currentDetachmentId(roster.borrowedDetachmentId) } : {}),
    ...(roster.picks ? { picks: roster.picks.map(currentPick) } : {}),
  }
}
