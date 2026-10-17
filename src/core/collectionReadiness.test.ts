import { describe, expect, it } from 'vitest'
import { rosterReadiness } from './collectionReadiness'

const empty = { counts: {}, progress: {}, wishes: {} }
const warriors = (models: number) => ({ entryId: 'warriors', name: 'Necron Warriors', models })

describe('roster readiness', () => {
  it('needs nothing for an empty roster', () => {
    expect(rosterReadiness([], empty)).toEqual({ datasheets: [], needed: 0, short: 0, toBuild: 0, toPaint: 0, painted: 0 })
  })

  it('is short of every model without a collection', () => {
    expect(rosterReadiness([warriors(10)], empty).short).toBe(10)
  })

  it('is short of nothing with one exactly owned unit', () => {
    expect(rosterReadiness([warriors(10)], { ...empty, counts: { warriors: 10 } }).short).toBe(0)
  })

  it('makes two units compete for one count', () => {
    expect(rosterReadiness([warriors(10), warriors(10)], { ...empty, counts: { warriors: 15 } }).short).toBe(5)
  })

  it('lists a datasheet once however many units field it', () => {
    expect(rosterReadiness([warriors(10), warriors(20)], empty).datasheets).toMatchObject([{ entryId: 'warriors', units: 2, needed: 30 }])
  })

  it('counts unbuilt models the roster needs among those owned', () => {
    expect(
      rosterReadiness([warriors(10)], { ...empty, counts: { warriors: 6 }, progress: { warriors: { built: 4, painted: 0 } } }).toBuild,
    ).toBe(2)
  })

  it('ignores unbuilt models beyond what the roster needs', () => {
    expect(
      rosterReadiness([warriors(5)], { ...empty, counts: { warriors: 20 }, progress: { warriors: { built: 5, painted: 0 } } }).toBuild,
    ).toBe(0)
  })

  it('counts unpainted models among those built', () => {
    expect(
      rosterReadiness([warriors(10)], { ...empty, counts: { warriors: 10 }, progress: { warriors: { built: 8, painted: 3 } } }).toPaint,
    ).toBe(5)
  })

  it('caps painted progress at what the roster needs', () => {
    expect(
      rosterReadiness([warriors(5)], { ...empty, counts: { warriors: 20 }, progress: { warriors: { built: 20, painted: 20 } } }).painted,
    ).toBe(5)
  })

  it('shows the wish beside the shortage', () => {
    expect(rosterReadiness([warriors(10)], { ...empty, wishes: { warriors: 4 } }).datasheets[0]).toMatchObject({ short: 10, wanted: 4 })
  })
})
