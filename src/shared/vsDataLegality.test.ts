import { describe, expect, it } from 'vitest'
import { vsRosterData, vsDataErrors, vsDataWithoutDetachments, type CheckedUnit } from './vsDataLegality'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const data = vsRosterData(
  {
    release: 'test',
    rulesVersion: { edition: '11th', update: 'test' },
    unavailable: [],
    points: [],
    definitions: {
      faction: {
        host: record('Host', {}),
        other: record('Other', {}),
        titan: record('Titan', {}),
        engines: record('Engines', { withoutDetachments: { warlords: [], dispositions: ['pack.take-and-hold'] } }),
      },
      'battle-size': { small: record('Small', { points: 1000, enhancements: 1 }) },
      detachment: { 'host.guard': record('Guard', { faction: 'host' }), 'other.raid': record('Raid', { faction: 'other' }) },
      allegiance: { 'host.mark.fire': record('Fire', {}) },
      unit: {
        'host.mob': record('Mob', { faction: 'host', keywords: ['INFANTRY'], sizes: [10, 20] }),
        'host.lord': record('Lord', {
          faction: 'host',
          keywords: ['CHARACTER', 'INFANTRY'],
          sizes: [1],
          allegiances: [{ choices: ['host.mark.fire'], required: true }],
        }),
        'other.fort': record('Fort', { faction: 'other', keywords: ['FORTIFICATION'], sizes: [1], legends: true }),
      },
      model: {
        'host.mob.grunt': record('Grunt', { unit: 'host.mob', min: 10, max: 20, wargear: {} }),
        'host.lord.lord': record('Lord', { unit: 'host.lord', min: 1, max: 1, wargear: {} }),
      },
      enhancement: {
        'host.guard.crown': record('Crown', {
          detachment: 'host.guard',
          type: 'model',
          eligibility: { anyOf: [{ keywords: ['CHARACTER'] }] },
        }),
      },
    },
  },
  {
    books: { 'bs-host': 'host', 'bs-titan': 'titan', 'bs-engines': 'engines' },
    detachments: { 'bs-guard': 'host.guard', 'bs-raid': 'other.raid' },
    units: { 'bs-mob': 'host.mob', 'bs-lord': 'host.lord', 'bs-fort': 'other.fort' },
    enhancements: { 'host.guard/bs-crown': 'host.guard.crown', 'host.guard/bs-fire': 'host.guard.crown' },
  },
  null,
  (id) => ({ 'bs-mob': 'Mob', 'bs-lord': 'Lord', 'bs-fort': 'Fort [Legends]' })[id],
)
const unit = (over: Partial<CheckedUnit> & Pick<CheckedUnit, 'entryId'>): CheckedUnit => ({
  key: 0,
  name: over.entryId,
  size: { models: 1, min: 1, max: 1 },
  toggles: [],
  keywords: [],
  choices: [],
  ...over,
})
const option = (id: string, name: string) => ({ name: 'Choice', options: [{ id, name, count: 1 }] as never })
const errors = (units: CheckedUnit[], detachmentIds = ['bs-guard']) =>
  vsDataErrors(data, { catalogueId: 'bs-host', detachmentIds, limit: 1000 }, units)

describe('vsDataErrors', () => {
  it('refuses a size the player chose that VS Data does not field', () => {
    expect(errors([unit({ entryId: 'bs-mob', size: { models: 15, min: 10, max: 20 } })])).toEqual([
      { entryId: 'bs-mob', entryName: 'bs-mob', message: 'fields 10 or 20 models, has 15' },
    ])
  })

  it('reads an option VS Data offers as an allegiance as that allegiance, not an Enhancement', () => {
    expect(errors([unit({ entryId: 'bs-lord', choices: [option('bs-fire', 'Mark of Fire')] })])).toEqual([])
  })

  it('asks for an allegiance the builder offers', () => {
    expect(
      errors([
        unit({ entryId: 'bs-lord', choices: [{ name: 'Mark', options: [{ id: 'bs-fire', name: 'Mark of Fire', count: 0 }] as never }] }),
      ]),
    ).toEqual([{ entryId: 'bs-lord', entryName: 'bs-lord', message: 'needs an allegiance' }])
  })

  it('does not ask for an allegiance the builder cannot offer', () => {
    expect(errors([unit({ entryId: 'bs-lord' })])).toEqual([])
  })

  it('refuses a list with no Detachment', () => {
    expect(errors([unit({ entryId: 'bs-mob', size: { models: 10, min: 10, max: 20 } })], [])).toEqual([
      { entryId: 'army', entryName: 'Army', message: 'needs one to three Detachments' },
    ])
  })

  it('refuses a Detachment to a faction that takes none', () => {
    expect(vsDataErrors(data, { catalogueId: 'bs-engines', detachmentIds: ['bs-raid'], limit: 1000 }, [])).toContainEqual({
      entryId: 'army',
      entryName: 'Army',
      message: 'takes no Detachment',
    })
  })

  it('leaves a list of a faction VS Data gives no Detachments to the catalogue', () => {
    expect(vsDataErrors(data, { catalogueId: 'bs-titan', detachmentIds: [], limit: 1000 }, [])).toBeNull()
  })

  it('leaves a Legends datasheet VS Data files under a faction the army does not ally with to the catalogue', () => {
    expect(errors([unit({ entryId: 'bs-fort' })])).toEqual([])
  })

  it('leaves a list with another faction’s Detachment to the catalogue', () => {
    expect(errors([unit({ entryId: 'bs-mob', size: { models: 15, min: 10, max: 20 } })], ['bs-raid'])).toBeNull()
  })
})

describe('vsDataWithoutDetachments', () => {
  it('names the force dispositions of a faction that takes no Detachment', () => {
    expect(vsDataWithoutDetachments(data, 'bs-engines')).toEqual(['take-and-hold'])
  })
})
