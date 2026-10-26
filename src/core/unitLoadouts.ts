import { z } from 'zod'
import { attachedUnits } from './attachedUnits'
import { idSchema, rosterPickSchema } from './commands'
import type { RosterPick } from './roster'

export const UNIT_LOADOUT_NAME_MAX_LENGTH = 80
export const UNIT_LOADOUTS_MAX = 100
const UNIT_LOADOUT_JOINED_MAX = 4

/** What a saved loadout keeps of a unit: its datasheet, squad size, wargear and nickname. */
const unitLoadoutPickSchema = rosterPickSchema.pick({ entryId: true, models: true, choices: true, spreads: true, nickname: true }).strict()

/** A unit attached within the loadout, joining the loadout's own unit (0) or an earlier joined unit (1 onwards). */
const joinedPickSchema = unitLoadoutPickSchema
  .extend({
    attachedTo: z
      .number()
      .int()
      .min(0)
      .max(UNIT_LOADOUT_JOINED_MAX - 1),
  })
  .strict()

export const unitLoadoutNameSchema = z.string().trim().min(1).max(UNIT_LOADOUT_NAME_MAX_LENGTH)

export const unitLoadoutSchema = z.object({
  name: unitLoadoutNameSchema,
  /** The book that owns every datasheet, in the rules version it was saved from. */
  catalogueId: idSchema,
  pick: unitLoadoutPickSchema,
  joined: z
    .array(joinedPickSchema)
    .min(1)
    .max(UNIT_LOADOUT_JOINED_MAX)
    .refine((joined) => joined.every((pick, at) => pick.attachedTo <= at), 'A joined unit must join one listed before it')
    .optional(),
})
export type UnitLoadout = z.infer<typeof unitLoadoutSchema>
type UnitLoadoutPick = z.infer<typeof unitLoadoutPickSchema>

type PricedUnit = { choices: readonly { key: string; kind?: 'enhancement' | 'upgrade' }[] }
type GroupPick = RosterPick & { key: number }

function savedPick(pick: RosterPick, unit: PricedUnit): UnitLoadoutPick {
  const special = new Set(unit.choices.filter((choice) => choice.kind).map((choice) => choice.key))
  const choices = pick.choices && Object.fromEntries(Object.entries(pick.choices).filter(([key]) => !special.has(key)))
  return {
    entryId: pick.entryId,
    ...(pick.models === undefined ? {} : { models: pick.models }),
    ...(choices && Object.keys(choices).length ? { choices } : {}),
    ...(pick.spreads ? { spreads: pick.spreads } : {}),
    ...(pick.nickname ? { nickname: pick.nickname } : {}),
  }
}

/**
 * The other units of the attached unit `key` stands in, joined units in the order each can
 * name the one it joins. Only units of the same book can share one loadout.
 */
export function joinedUnits<T extends GroupPick>(picks: readonly T[], key: number, rosterCatalogueId: string): T[] {
  const [host, ...joined] = attachedUnits(picks, key)
  if (!host) return []
  const book = (pick: RosterPick) => pick.catalogueId ?? rosterCatalogueId
  const waiting = joined.filter((pick) => book(pick) === book(host))
  const ordered: T[] = []
  const reached = new Set([host.key])
  for (let next = waiting.findIndex((pick) => reached.has(pick.attachedTo ?? -1)); next >= 0;) {
    const [pick] = waiting.splice(next, 1) as [T]
    ordered.push(pick)
    reached.add(pick.key)
    next = waiting.findIndex((candidate) => reached.has(candidate.attachedTo ?? -1))
  }
  return ordered.slice(0, UNIT_LOADOUT_JOINED_MAX)
}

/**
 * A roster unit, and optionally the units attached with it, as a saved loadout.
 *
 * The note, Warlord, enhancements, detachment upgrades and transport seat belong to the army the
 * unit stood in, so a loadout never carries them into another. Only a priced unit says which
 * choices are enhancements, so an unpriced one cannot be saved.
 */
export function loadoutOf(
  group: readonly { pick: GroupPick; unit: PricedUnit | undefined }[],
  rosterCatalogueId: string,
): Omit<UnitLoadout, 'name'> | null {
  const [host, ...joined] = group
  if (!host || group.some(({ unit }) => !unit)) return null
  const keys = group.map(({ pick }) => pick.key)
  return {
    catalogueId: host.pick.catalogueId ?? rosterCatalogueId,
    pick: savedPick(host.pick, host.unit as PricedUnit),
    ...(joined.length
      ? {
          joined: joined.map(({ pick, unit }) => ({
            ...savedPick(pick, unit as PricedUnit),
            attachedTo: keys.indexOf(pick.attachedTo ?? -1),
          })),
        }
      : {}),
  }
}
