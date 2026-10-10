import { describe, expect, it } from 'vitest'
import { samePriceContext, survivingUnits } from './pricePlaceholder'
import { priceQuery } from '../../../queries'

describe('samePriceContext', () => {
  const request = (catalogueId = 'cat', detachmentIds = ['host'], limit = 2000, models = 2) =>
    priceQuery(catalogueId, detachmentIds, 'take-and-hold', limit, [{ entryId: 'squad', models }], [], null, [], true).queryKey

  it('retains checked limits while equipment and model counts change', () => {
    expect(samePriceContext(request(), request('cat', ['host'], 2000, 3))).toBe(true)
  })

  it.each([
    ['other-cat', ['host'], 2000],
    ['cat', ['other-host'], 2000],
    ['cat', ['host'], 1000],
  ] as const)('discards limits when the army setup changes to %s/%s/%i', (catalogueId, detachmentIds, limit) => {
    expect(samePriceContext(request(), request(catalogueId, [...detachmentIds], limit))).toBe(false)
  })

  it('does not retain a result before the first check', () => {
    expect(samePriceContext(undefined, request())).toBe(false)
  })
})

describe('survivingUnits', () => {
  const captain = { entryId: 'captain', catalogueId: 'space-marines' }
  const intercessors = { entryId: 'intercessors', catalogueId: 'space-marines' }
  const hellblasters = { entryId: 'hellblasters', catalogueId: 'space-marines' }

  it('keeps every price while a unit choice changes', () => {
    expect(
      survivingUnits([{ ...captain, choices: { enhancement: 'relic' } }], [{ ...captain, choices: { enhancement: 'blade' } }]),
    ).toEqual([0])
  })

  it('keeps picks whose primary catalogue is implicit', () => {
    expect(survivingUnits([{ entryId: 'captain' }], [{ entryId: 'captain', models: 1 }])).toEqual([0])
  })

  it('keeps every price while a unit is appended, leaving the new one to be priced', () => {
    expect(survivingUnits([captain], [captain, intercessors])).toEqual([0])
  })

  it('keeps the units a removal left standing', () => {
    expect(survivingUnits([captain, intercessors, hellblasters], [captain, hellblasters])).toEqual([0, 2])
    expect(survivingUnits([captain, intercessors], [intercessors])).toEqual([1])
    expect(survivingUnits([captain, intercessors], [])).toEqual([])
  })

  it('stops where the old prices stop describing this list', () => {
    // Nothing is left to match the captain against, so his card and everything after
    // it waits rather than being drawn against the wrong unit.
    expect(survivingUnits([intercessors, hellblasters], [hellblasters, captain, intercessors])).toEqual([1])
  })

  it('has nothing to say without a previous list', () => {
    expect(survivingUnits(undefined, [captain])).toBeNull()
    expect(survivingUnits('not a list', [captain])).toBeNull()
  })
})
