import { z } from 'zod'
import rawRetainedRules from '../../catalogue/retained-roster-rules.json' with { type: 'json' }
import type { RosterPick } from './roster'
import { catalogueEditionId } from './catalogueEdition'

const replacementSchema = z.object({ id: z.string() })
/**
 * `count` turns a saved single choice into that many of the option, for a group that now holds several;
 * `with` holds the choices a saved single choice's new key sits under, which the saved pick never made.
 */
const optionSchema = z.object({
  key: z.string(),
  id: z.string(),
  count: z.number().int().positive().optional(),
  with: z.record(z.string(), z.string()).optional(),
})
export const retiredSourceSchema = z.object({
  catalogues: z.record(z.string(), replacementSchema),
  detachments: z.record(z.string(), replacementSchema),
  datasheets: z.record(
    z.string(),
    replacementSchema.extend({
      choices: z.record(z.string(), z.record(z.string(), optionSchema)).optional(),
      toggles: z.record(z.string(), z.string()).optional(),
      fixedChoices: z.record(z.string(), z.array(z.string())).optional(),
    }),
  ),
})

export const retainedRules = z
  .array(
    z.object({
      editionId: z.string(),
      /** When the app first served the rules that replaced these: a roster last saved from then on was built on the newer rules. */
      savedBefore: z.number().int(),
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

export const retainedRulesFor = (catalogueId: string) => retainedRules.find((rule) => rule.editionId === catalogueEditionId(catalogueId))

/**
 * The retained rules version a roster on a plain book ID was built for, read from its contents and when it was last saved.
 * Without a save date the ID means the current rules: only a stored row knows it predates them.
 */
export function retainedRulesEdition(roster: {
  catalogueId: string
  detachmentIds: readonly string[]
  borrowedDetachmentId?: string | null
  picks?: readonly RosterPick[]
  units?: readonly RosterPick[]
  updatedAt?: number
}) {
  const { updatedAt } = roster
  if (updatedAt === undefined || catalogueEditionId(roster.catalogueId)) return null
  const picks = [...(roster.picks ?? []), ...(roster.units ?? [])]
  return (
    retainedRules.find(
      (rule) =>
        updatedAt < rule.savedBefore &&
        rule.catalogueIds.includes(roster.catalogueId) &&
        (rule.originalCatalogueIds.includes(roster.catalogueId) ||
          roster.detachmentIds.some((id) => rule.detachments.includes(id)) ||
          (roster.borrowedDetachmentId && rule.detachments.includes(roster.borrowedDetachmentId)) ||
          (rule.selectionGroups.length > 0 &&
            rule.selectionGroups.every((group) =>
              group.some((selection) =>
                picks.some(
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
    )?.editionId ?? null
  )
}
