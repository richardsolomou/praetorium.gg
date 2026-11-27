import { z } from 'zod'
import rawMissions from '../../catalogue/legacy-ids/missions.json' with { type: 'json' }

/**
 * A frozen map from the Game Datacards IDs battle logs, saved rosters and links hold to the VS Data IDs that replaced
 * them. Stored IDs are never rewritten, so every read of one meets the rules through these maps. Entries are only added.
 * `units.json` also gives, under the same key, the VS Data allegiance a datasheet implies for a pick that holds no
 * allegiance choice of its own: the one its name spells, as Khorne Soul Grinder is the Soul Grinder taking Khorne, else
 * the one it is built on before any choice is made, as Daemon Prince of Chaos starts on Khorne. An ID only ever gains one.
 */
export const legacyIdsSchema = z.object({
  format: z.literal('praetorium.legacy-ids.v1'),
  ids: z.record(z.string(), z.string()),
  allegiances: z.record(z.string(), z.string()).optional(),
})

/**
 * A frozen map from each choice a saved pick holds (`<choice key>|<option ID>` on a BSData datasheet entry) to the VS
 * Data selections it stands for, or the allegiance it takes. It reads the current rules version only: never read it for
 * a list of a retained rules version, whose choices can differ.
 *
 * A reader translates a pick in order. A `floor: true` pick first takes, for each choice in `floor` it does not hold,
 * the option listed (`''` is nothing, read as the key `<choice key>|`) or, for a group the squad divides, the counts
 * listed. It then starts from VS Data's unit at the pick's size and adds `base`, the selections that turn VS Data's
 * first fielding into BSData's, absent where they agree; a `base` of `'unmatched'` means no pick of the entry can be
 * translated. Each single pick (a pick's `choices`) adds its key once. Each group the squad divides (a pick's `spreads`)
 * adds every option's key once for each of it the pick holds beyond the group's first fielding, counted at the unit's
 * first size, fewer counting negative: in a group full at first fielding a key is one more of its option and one fewer
 * of the option the group names as ordinary (else of the first other held), otherwise one more of its option alone.
 *
 * Selections are option → wargear → count; a negative count takes back a selection that VS Data's defaults, `base` or
 * the choice above made. A choice beneath another is read on the unit with that one taken. Every key a pick can hold is
 * in `choices`, where an option first fielded or a unit composition maps to no selections, or in `unmatched`. Choices,
 * `base` and `floor` are only added; a mapped one never changes.
 */
export const legacyOptionsSchema = z.object({
  format: z.literal('praetorium.legacy-options.v1'),
  units: z.record(
    z.string(),
    z.object({
      unit: z.string(),
      base: z.union([z.object({ options: z.record(z.string(), z.record(z.string(), z.number())) }), z.literal('unmatched')]).optional(),
      floor: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.number())])).optional(),
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
