import { z } from 'zod'
import rawMissions from '../../catalogue/legacy-ids/missions.json' with { type: 'json' }

/**
 * A frozen map from the Game Datacards IDs battle logs, saved rosters and links hold to the VS Data IDs that replaced
 * them. Stored IDs are never rewritten, so every read of one meets the rules through these maps. Entries are only added.
 */
export const legacyIdsSchema = z.object({ format: z.literal('praetorium.legacy-ids.v1'), ids: z.record(z.string(), z.string()) })

/**
 * A frozen map from each choice a saved pick holds (`<choice key>|<option ID>` on a BSData datasheet entry) to the VS
 * Data selections it stands for, or the allegiance it takes. A choice no selection reproduces is listed in `unmatched`.
 * Choices are only added; a mapped one never changes.
 */
export const legacyOptionsSchema = z.object({
  format: z.literal('praetorium.legacy-options.v1'),
  units: z.record(
    z.string(),
    z.object({
      unit: z.string(),
      choices: z.record(
        z.string(),
        z.union([z.object({ options: z.record(z.string(), z.record(z.string(), z.number())) }), z.object({ allegiance: z.string() })]),
      ),
      unmatched: z.array(z.string()),
    }),
  ),
})

export const legacyIds = (raw: unknown) => {
  const ids = new Map(Object.entries(legacyIdsSchema.parse(raw).ids))
  return (id: string) => ids.get(id) ?? id
}

/** The VS Data ID of a mission card, deployment, layout or twist a battle stored by its Game Datacards ID. */
export const currentMissionId = legacyIds(rawMissions)

/** Whether two stored or current mission IDs name the same thing. */
export const sameMissionId = (left: string | null | undefined, right: string | null | undefined) =>
  left !== null && left !== undefined && right !== null && right !== undefined && currentMissionId(left) === currentMissionId(right)
