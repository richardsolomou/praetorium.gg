import { z } from 'zod'
import rawMissions from '../../catalogue/legacy-ids/missions.json' with { type: 'json' }

/**
 * A frozen map from the Game Datacards IDs battle logs, saved rosters and links hold to the VS Data IDs that replaced
 * them. Stored IDs are never rewritten, so every read of one meets the rules through these maps. Entries are only added.
 */
export const legacyIdsSchema = z.object({ format: z.literal('praetorium.legacy-ids.v1'), ids: z.record(z.string(), z.string()) })

/**
 * A frozen map from each choice a saved pick holds (`<choice key>|<option ID>` on a BSData datasheet entry) to the VS
 * Data selections it stands for, or the allegiance it takes. It reads the current rules version only: never read it for
 * a list of a retained rules version, whose choices can differ.
 *
 * Selections are option → wargear → count, added to VS Data's unit as first fielded at the pick's size; a negative count
 * takes back a selection that VS Data's defaults or the choice above made. A choice beneath another is read on the unit
 * with that one taken, which is also its first fielding. A single pick (a pick's `choices`) applies its key once. In a
 * group the squad divides (a pick's `spreads`), apply every option's key once for each of it the pick holds beyond the
 * first fielding, fewer counting negative. If the group is full at first fielding, a key is one more of its option and
 * one fewer of the option the group names as ordinary (else of the first other held), and that ordinary option has no
 * key; otherwise a key is one more of its option alone. A single pick's first-fielded option has a key only where
 * BSData's default differs from VS Data's; one without a key changes nothing. A choice without a translation, including
 * one some pick would carry past what VS Data allows, is listed in `unmatched`. Choices are only added; a mapped one
 * never changes.
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
