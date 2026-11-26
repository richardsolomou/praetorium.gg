import { describe, expect, it } from 'vitest'
import { vsRosterData, vsDataErrors, type CheckedUnit } from './vsDataLegality'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const data = vsRosterData(
  {
    release: 'test',
    rulesVersion: { edition: '11th', update: 'test' },
    unavailable: [],
    points: [],
    definitions: {
      faction: { host: record('Host', {}), other: record('Other', {}) },
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
    books: { 'bs-host': 'host' },
    detachments: { 'bs-guard': 'host.guard', 'bs-raid': 'other.raid' },
    units: { 'bs-mob': 'host.mob', 'bs-lord': 'host.lord' },
    enhancements: { 'host.guard/bs-crown': 'host.guard.crown', 'host.guard/bs-fire': 'host.guard.crown' },
  },
  null,
  (id) => ({ 'bs-mob': 'Mob', 'bs-lord': 'Lord' })[id],
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

  it('leaves a list with no Detachment to the catalogue', () => {
    expect(errors([unit({ entryId: 'bs-mob', size: { models: 15, min: 10, max: 20 } })], [])).toBeNull()
  })

  it('gives a unit the catalogue reads as a Character the Enhancement VS Data keeps for Characters', () => {
    expect(
      errors([
        unit({
          entryId: 'bs-mob',
          size: { models: 10, min: 10, max: 20 },
          keywords: ['Character'],
          choices: [option('bs-crown', 'Crown')],
        }),
      ]),
    ).toEqual([])
  })

  it('leaves a list with another faction’s Detachment to the catalogue', () => {
    expect(errors([unit({ entryId: 'bs-mob', size: { models: 15, min: 10, max: 20 } })], ['bs-raid'])).toBeNull()
  })
})
