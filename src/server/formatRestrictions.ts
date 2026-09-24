import { enforces, formatDatasheetLimit, kotcDatasheetRepeatable, kotcUnitExclusions } from '../core/battle'
import { type FactionRestrictions, restrictedBy } from './datacards'

type KotcUnit = {
  entryId: string
  name: string
  keywords: readonly string[]
  toughness: number | null
  warlord: boolean
  enhanced?: boolean
  led?: boolean
}

export function factionRestrictionViolations(restrictions: FactionRestrictions | undefined, units: readonly KotcUnit[]) {
  if (!restrictions) return []
  return units.flatMap((unit) => {
    const restricted = restrictedBy(restrictions, unit.name, unit.keywords)
    if (!restricted) return []
    return [
      {
        entryId: unit.entryId,
        entryName: unit.name,
        message: `is not allowed in this faction${restricted.keyword ? ` (${restricted.keyword})` : ''}`,
      },
    ]
  })
}

/**
 * Prototype KOTC 2.0 army-construction changes layered over normal Incursion legality.
 *
 * Every rule here is named in `formatRules`, and a roster that has waived one is not
 * told about it: the restriction the player switched off is the restriction they
 * agreed with their table not to play.
 */
export function kotcViolations(detachments: number, units: readonly KotcUnit[], limit = 600, waived: readonly string[] = []) {
  const errors: { entryId: string; entryName: string; message: string }[] = []
  const add = (message: string, unit?: KotcUnit) =>
    errors.push({ entryId: unit?.entryId ?? 'kotc', entryName: unit?.name ?? 'King of the Colosseum', message })
  if (enforces(waived, 'detachments') && detachments !== 1) add(`needs exactly 1 detachment, has ${detachments}`)
  if (enforces(waived, 'kotc-infantry') && units.filter((unit) => hasKeyword(unit, 'infantry')).length < 2)
    add('needs at least 2 Infantry units')
  if (enforces(waived, 'kotc-warlord') && !units.some((unit) => unit.warlord)) add('needs a Warlord')
  for (const unit of units) {
    for (const message of kotcUnitExclusions(unit, waived)) add(message, unit)
    // Only worth saying while a Toughness rule is being enforced: with the cap
    // waived, a Toughness this catalogue cannot state changes no answer.
    if (enforces(waived, 'kotc-toughness') && unit.toughness === null) add('cannot verify its Toughness from the synced catalogue', unit)
  }
  // King of the Colosseum bars a unit that reaches Toughness 10 during list building,
  // whether from an enhancement or an attached leader. No synced source says what either
  // does to a Toughness, so a unit already at the cap is reported as unverifiable rather
  // than passed: the format's own FAQ makes this illegal, and guessing it legal is the
  // one answer that cannot be corrected at the table.
  for (const unit of units) {
    if (enforces(waived, 'kotc-toughness') && unit.toughness === 9 && (unit.enhanced || unit.led))
      add(`is at the Toughness cap and cannot be verified once its ${unit.enhanced ? 'enhancement' : 'attached leader'} is applied`, unit)
  }
  const toughnessNine = units.filter((unit) => unit.toughness === 9)
  if (enforces(waived, 'kotc-toughness') && toughnessNine.length > 1) add(`allows at most 1 Toughness 9 unit, has ${toughnessNine.length}`)
  const byDatasheet = new Map<string, KotcUnit[]>()
  for (const unit of units) byDatasheet.set(unit.entryId, [...(byDatasheet.get(unit.entryId) ?? []), unit])
  for (const copies of byDatasheet.values()) {
    const allowance = formatDatasheetLimit(
      limit,
      copies.some((unit) => kotcDatasheetRepeatable(unit.keywords)),
      waived,
    )
    if (allowance !== null && copies.length > allowance)
      add(`allows at most ${allowance} of this datasheet, has ${copies.length}`, copies[0])
  }
  return errors
}

/**
 * Whether a limit was broken by the catalogue building a unit rather than by a
 * player. Only ever true inside a unit the catalogue composes itself, and only for
 * a limit being exceeded: anything else is still the player's to answer for.
 */
export function isCatalogueSelfContradiction(
  error: { entryId: string; message: string },
  composedByCatalogue: ReadonlyMap<string, string>,
) {
  return composedByCatalogue.has(error.entryId) && error.message.startsWith('allows at most ')
}

const hasKeyword = (unit: KotcUnit, keyword: string) => unit.keywords.some((candidate) => candidate.trim().toLocaleLowerCase() === keyword)
