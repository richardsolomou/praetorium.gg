import type { Datasheet } from '../contracts/catalogue'

/**
 * A datasheet's unconditional unit sizes and costs as one line, or null when it has none.
 * A cost that depends on a keyword, faction or detachment is left out rather than stated
 * without the condition that makes it true.
 */
export function unitCostsSummary(costs: Datasheet['costs']) {
  const unconditional = unconditionalCosts(costs)
  if (!unconditional.length) return null
  return unconditional.map((cost) => `${cost.models} ${cost.models === '1' ? 'model' : 'models'} for ${cost.cost} pts`).join(', ')
}

const unconditionalCosts = (costs: Datasheet['costs']) =>
  costs
    .filter((cost) => !cost.keyword && !cost.faction && !cost.detachment && !cost.copies)
    .toSorted((left, right) => Number(left.models) - Number(right.models))

/**
 * A datasheet's unconditional price as one figure, `80 pts`, or the range its unit sizes span,
 * `80–160 pts`; the sheet's own points when it prints no sizes, and null when nothing is unconditional.
 */
export function datasheetPoints(sheet: Pick<Datasheet, 'points' | 'costs'>) {
  const unconditional = unconditionalCosts(sheet.costs).map((cost) => Number(cost.cost))
  if (!unconditional.length) return sheet.points === null ? null : `${sheet.points} pts`
  if (unconditional.some((cost) => !Number.isFinite(cost))) return null
  const low = Math.min(...unconditional)
  const high = Math.max(...unconditional)
  return low === high ? `${low} pts` : `${low}–${high} pts`
}

export function datasheetDescription(sheet: Pick<Datasheet, 'name' | 'points' | 'costs' | 'baseSize'>, faction: string) {
  const costs = unitCostsSummary(sheet.costs) ?? (sheet.points === null ? null : `${sheet.points} points`)
  return [
    `${sheet.name} datasheet for ${faction}.`,
    costs ? `${costs}.` : null,
    sheet.baseSize && !sheet.baseSize.includes('\n') ? `Base size: ${sheet.baseSize}.` : null,
    'Profiles, weapons, abilities and wargear.',
  ]
    .filter(Boolean)
    .join(' ')
}
