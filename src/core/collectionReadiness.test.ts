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

  describe('with models that also count as other datasheets', () => {
    const russ = { entryId: 'russ', name: 'Leman Russ Battle Tank', models: 1 }
    const demolisher = { entryId: 'demolisher', name: 'Leman Russ Demolisher', models: 1 }
    const commander = { entryId: 'commander', name: 'Tank Commander', models: 1 }

    it('fills a linked datasheet from the models it is counted under', () => {
      expect(rosterReadiness([demolisher], { ...empty, counts: { russ: 1 }, countsAs: { russ: ['demolisher'] } }).short).toBe(0)
    })

    it('names where the borrowed models are counted', () => {
      expect(
        rosterReadiness([demolisher], { ...empty, counts: { russ: 1 }, countsAs: { russ: ['demolisher'] } }).datasheets[0]!.from,
      ).toEqual([{ entryId: 'russ', models: 1 }])
    })

    it('counts each model once across the datasheets it counts as', () => {
      expect(
        rosterReadiness([russ, demolisher, commander], { ...empty, counts: { russ: 2 }, countsAs: { russ: ['demolisher', 'commander'] } })
          .short,
      ).toBe(1)
    })

    it('does not link datasheets the other way', () => {
      expect(rosterReadiness([russ], { ...empty, counts: { demolisher: 1 }, countsAs: { russ: ['demolisher'] } }).short).toBe(1)
    })

    it('moves a flexible model aside for a datasheet only it counts as', () => {
      expect(
        rosterReadiness([demolisher, commander], {
          ...empty,
          counts: { russ: 1, hull: 1 },
          countsAs: { russ: ['demolisher', 'commander'], hull: ['demolisher'] },
        }).short,
      ).toBe(0)
    })

    it('prefers painted models whichever datasheet takes them', () => {
      expect(
        rosterReadiness([demolisher, commander], {
          ...empty,
          counts: { russ: 1, hull: 1 },
          progress: { russ: { built: 1, painted: 1 }, hull: { built: 1, painted: 1 } },
          countsAs: { russ: ['demolisher', 'commander'], hull: ['demolisher'] },
        }).toPaint,
      ).toBe(0)
    })

    it('keeps built models with the datasheets that take them', () => {
      expect(
        rosterReadiness([russ, demolisher], {
          ...empty,
          counts: { russ: 2 },
          progress: { russ: { built: 1, painted: 0 } },
          countsAs: { russ: ['demolisher'] },
        }),
      ).toMatchObject({ short: 0, toBuild: 1, toPaint: 1 })
    })

    it('ignores links to datasheets the roster does not include', () => {
      expect(rosterReadiness([russ], { ...empty, counts: { russ: 1 }, countsAs: { russ: ['demolisher'] } }).datasheets[0]!.from).toEqual([])
    })
  })
})
