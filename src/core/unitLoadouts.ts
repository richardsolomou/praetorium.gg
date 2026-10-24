import { z } from 'zod'
import { idSchema, rosterPickSchema } from './commands'
import type { RosterPick } from './roster'

export const UNIT_LOADOUT_NAME_MAX_LENGTH = 80
export const UNIT_LOADOUTS_MAX = 100

/** What a saved loadout keeps of a unit: its datasheet, squad size and wargear. */
export const unitLoadoutPickSchema = rosterPickSchema.pick({ entryId: true, models: true, choices: true, spreads: true }).strict()

export const unitLoadoutNameSchema = z.string().trim().min(1).max(UNIT_LOADOUT_NAME_MAX_LENGTH)

export const unitLoadoutSchema = z.object({
  name: unitLoadoutNameSchema,
  /** The book that owns the datasheet, in the rules version it was saved from. */
  catalogueId: idSchema,
  pick: unitLoadoutPickSchema,
})
export type UnitLoadout = z.infer<typeof unitLoadoutSchema>

type PricedUnit = { choices: readonly { key: string; kind?: 'enhancement' | 'upgrade' }[] }

/**
 * A roster unit as a saved loadout.
 *
 * The nickname, note, Warlord, attachment, enhancements and detachment upgrades belong to the army the
 * unit stood in, so a loadout never carries them into another. Only a priced unit says which
 * choices are enhancements, so an unpriced one cannot be saved.
 */
export function loadoutOf(pick: RosterPick, rosterCatalogueId: string, unit: PricedUnit | undefined): Omit<UnitLoadout, 'name'> | null {
  if (!unit) return null
  const special = new Set(unit.choices.filter((choice) => choice.kind).map((choice) => choice.key))
  const choices = pick.choices && Object.fromEntries(Object.entries(pick.choices).filter(([key]) => !special.has(key)))
  return {
    catalogueId: pick.catalogueId ?? rosterCatalogueId,
    pick: {
      entryId: pick.entryId,
      ...(pick.models === undefined ? {} : { models: pick.models }),
      ...(choices && Object.keys(choices).length ? { choices } : {}),
      ...(pick.spreads ? { spreads: pick.spreads } : {}),
    },
  }
}
