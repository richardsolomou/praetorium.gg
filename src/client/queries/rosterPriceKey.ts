import type { PriceInput } from '../../contracts/schemas'

export function rosterPriceKey(data: PriceInput) {
  return [
    'price',
    data.catalogueId,
    data.detachmentIds,
    data.disposition,
    data.limit,
    data.waivedRules ?? [],
    data.borrowedDetachmentId ?? null,
    data.optionalRules ?? [],
    ...(data.includeUnitLimits ? ['unit-limits'] : []),
    data.units,
  ]
}
