import { z } from 'zod'
import rawMissions from '../../catalogue/legacy-ids/missions.json' with { type: 'json' }

/**
 * A frozen map from the Game Datacards IDs battle logs, saved rosters and links hold to the VS Data IDs that replaced
 * them. Stored IDs are never rewritten, so every read of one meets the rules through these maps. Entries are only added.
 * `units.json` also gives, under the same key, the VS Data allegiance a datasheet implies for a pick that holds no
 * allegiance choice of its own: the one its name spells, as Khorne Soul Grinder is the Soul Grinder taking Khorne, else
 * the one it is built on before any choice is made, as Daemon Prince of Chaos starts on Khorne. An ID only ever gains one.
 * A Library datasheet that is another unit in some books, as a chaos book's Warhound Titan is the Chaos Warhound Titan,
 * is also keyed `<book>/<ID>`, which a list of that book reads first.
 */
export const legacyIdsSchema = z.object({
  format: z.literal('praetorium.legacy-ids.v1'),
  ids: z.record(z.string(), z.string()),
  allegiances: z.record(z.string(), z.string()).optional(),
})

/**
 * A frozen map from each choice a saved pick holds (`<choice key>|<option ID>` on a BSData datasheet entry, keyed as
 * `units.json` keys the datasheet) to the VS Data selections it stands for, or the allegiance it takes. It reads the current rules version only: never read it for
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
 * `base` and `floor` are only added; a mapped one never changes, and a `floor` never does. An entry is derived afresh,
 * keeping every key it held (those that no longer translate in `unmatched`), only when `units.json` moves its datasheet
 * to another unit, or when a `base` of `'unmatched'` now maps; a moved datasheet whose new unit cannot be read takes a
 * `base` of `'unmatched'` and no choices, every key it held in `unmatched`.
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

/** The BSData game system and points cost type a `.ros` file names, which Yellowscribe picks its 11th edition reader by. */
export const legacyBattleScribeSchema = z.object({
  format: z.literal('praetorium.legacy-battlescribe.v1'),
  gameSystem: z.object({ id: z.string(), name: z.string() }),
  pointsTypeId: z.string(),
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

export type LegacyOptions = z.infer<typeof legacyOptionsSchema>['units']
type Selections = Record<string, Record<string, number>>

/**
 * A BSData pick's choices read through its datasheet's entry of the per-choice map, as `legacyOptionsSchema` says: the
 * VS Data selections they add to the unit's defaults, and the allegiance one takes; null where a key or the base is
 * unmatched. `firstHeld` is how many of an option a group holds at the datasheet's first fielding.
 */
export function legacyOptionSelections(
  entry: LegacyOptions[string],
  pick: { choices?: Readonly<Record<string, string>>; spreads?: Readonly<Record<string, Record<string, number>>>; floor?: boolean },
  firstHeld: (key: string, option: string) => number,
): { selections: Selections; allegiance?: string } | null {
  if (entry.base === 'unmatched') return null
  const selections: Selections = {}
  let allegiance: string | undefined
  const add = (parts: Selections, times: number) => {
    for (const [option, chosen] of Object.entries(parts))
      for (const [wargear, n] of Object.entries(chosen)) {
        const into = (selections[option] ??= {})
        into[wargear] = (into[wargear] ?? 0) + n * times
      }
  }
  add(entry.base?.options ?? {}, 1)
  const keyed = (key: string, times: number) => {
    const translation = entry.choices[key]
    if (!translation) return false
    if ('options' in translation) add(translation.options, times)
    else allegiance = translation.allegiance
    return true
  }
  const choices: Record<string, string> = {}
  const spreads: Record<string, Record<string, number>> = {}
  for (const [key, value] of Object.entries(pick.floor ? (entry.floor ?? {}) : {}))
    if (typeof value === 'string') choices[key] = value
    else spreads[key] = value
  Object.assign(choices, pick.choices)
  Object.assign(spreads, pick.spreads)
  for (const [key, option] of Object.entries(choices)) if (!keyed(`${key}|${option}`, 1)) return null
  for (const [key, counts] of Object.entries(spreads))
    for (const [option, n] of Object.entries(counts)) {
      const times = n - firstHeld(key, option)
      if (times && !keyed(`${key}|${option}`, times)) return null
    }
  return { selections, ...(allegiance ? { allegiance } : {}) }
}
