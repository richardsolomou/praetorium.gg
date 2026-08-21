import { describe, expect, it } from 'vitest'
import { survivingUnits } from './pricePlaceholder'

describe('survivingUnits', () => {
  const captain = { entryId: 'captain', catalogueId: 'space-marines' }
  const intercessors = { entryId: 'intercessors', catalogueId: 'space-marines' }
  const hellblasters = { entryId: 'hellblasters', catalogueId: 'space-marines' }

  it('keeps every price while a unit choice changes', () => {
    expect(
      survivingUnits([{ ...captain, choices: { enhancement: 'relic' } }], [{ ...captain, choices: { enhancement: 'blade' } }]),
    ).toEqual([0])
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
