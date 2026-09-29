import { describe, expect, it } from 'vitest'
import type { RosterPick } from './roster'
import { rosterDifferences, sameRoster } from './rosterDifferences'

const list = (picks: RosterPick[], setup: Partial<Parameters<typeof rosterDifferences>[0]> = {}) => ({
  catalogueId: 'necrons',
  detachmentIds: ['awakened'],
  disposition: 'take-and-hold',
  limit: 2_000,
  waivedRules: [],
  picks,
  ...setup,
})
const warriors = { entryId: 'warriors', models: 10 }
const immortals = { entryId: 'immortals', models: 5 }
const overlord = { entryId: 'overlord' }

describe('how a variant differs from its base', () => {
  it('finds nothing between two lists holding the same units in another order', () => {
    expect(sameRoster(rosterDifferences(list([warriors, immortals]), list([immortals, warriors])))).toBe(true)
  })

  it('names a datasheet the variant adds', () => {
    expect(rosterDifferences(list([warriors]), list([warriors, immortals])).added).toEqual([{ entryId: 'immortals', count: 1 }])
  })

  it('counts a second copy of a datasheet as one added unit', () => {
    expect(rosterDifferences(list([warriors]), list([warriors, warriors])).added).toEqual([{ entryId: 'warriors', count: 1 }])
  })

  it('names a datasheet the variant removes', () => {
    expect(rosterDifferences(list([warriors, immortals]), list([warriors])).removed).toEqual([{ entryId: 'immortals', count: 1 }])
  })

  it('counts a unit with different choices as a changed loadout rather than a swap', () => {
    const tesla = { ...immortals, choices: { weapon: 'tesla' } }
    expect(rosterDifferences(list([immortals]), list([tesla]))).toMatchObject({ added: [], removed: [], loadouts: 1 })
  })

  it('reads the same choices written in another key order as unchanged', () => {
    const before = { ...immortals, choices: { weapon: 'tesla', shield: 'none' } }
    const after = { ...immortals, choices: { shield: 'none', weapon: 'tesla' } }
    expect(sameRoster(rosterDifferences(list([before]), list([after])))).toBe(true)
  })

  it('compares a joined leader by the unit it joins rather than its position', () => {
    const before = list([{ ...overlord, attachedTo: 2 }, immortals, warriors])
    const after = list([immortals, warriors, { ...overlord, attachedTo: 1 }])
    expect(sameRoster(rosterDifferences(before, after))).toBe(true)
  })

  it('counts a leader moved to another unit as a changed loadout', () => {
    const before = list([{ ...overlord, attachedTo: 1 }, warriors, immortals])
    const after = list([{ ...overlord, attachedTo: 2 }, warriors, immortals])
    expect(rosterDifferences(before, after).loadouts).toBe(1)
  })

  it('keeps an allied datasheet apart from the same entry in the primary force', () => {
    const allied = { entryId: 'warriors', catalogueId: 'ally', models: 10 }
    expect(rosterDifferences(list([warriors]), list([allied]))).toMatchObject({
      added: [{ entryId: 'warriors', catalogueId: 'ally', count: 1 }],
      removed: [{ entryId: 'warriors', count: 1 }],
    })
  })

  it('names each changed part of the setup', () => {
    const after = list([], { limit: 1_000, detachmentIds: ['hypercrypt'], disposition: 'purge', waivedRules: ['kotc-epic-heroes'] })
    expect(rosterDifferences(list([]), after).setup).toEqual(['size', 'detachment', 'disposition', 'rules'])
  })

  it('names the detachments a variant adds and drops', () => {
    expect(
      rosterDifferences(list([], { detachmentIds: ['awakened', 'cursed'] }), list([], { detachmentIds: ['awakened', 'hypercrypt'] }))
        .detachments,
    ).toEqual({
      added: ['hypercrypt'],
      removed: ['cursed'],
      replaced: false,
    })
  })

  it('says a variant keeping none of its base’s detachments replaced them', () => {
    expect(rosterDifferences(list([]), list([], { detachmentIds: ['hypercrypt'] })).detachments.replaced).toBe(true)
  })

  it('counts a borrowed detachment as a detachment change', () => {
    expect(rosterDifferences(list([]), list([], { borrowedDetachmentId: 'armoury' })).setup).toEqual(['detachment'])
  })

  it('compares no units across factions', () => {
    expect(rosterDifferences(list([warriors]), list([warriors], { catalogueId: 'marines' }))).toMatchObject({
      setup: ['faction'],
      added: [],
      removed: [],
      loadouts: 0,
    })
  })
})
