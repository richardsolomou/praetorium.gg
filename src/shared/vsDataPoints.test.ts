import { describe, expect, it } from 'vitest'
import { vsDataDefinitions } from '../core/vsDataConstruction'
import { mfmPrice } from './mfm'
import { vsCostRows, vsMfmDetachment, vsMfmUnit, vsPointsIndex } from './vsDataPoints'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const definitions = vsDataDefinitions({
  release: 'test',
  rulesVersion: { edition: '11th', update: 'test' },
  unavailable: [],
  definitions: {
    faction: { host: record('Host', {}), other: record('Other', {}) },
    detachment: { 'host.guard': record('Guard', { faction: 'host' }) },
    unit: {
      'host.tank': record('Tank', { faction: 'host', keywords: [], sizes: [1] }),
      'host.relic-tank': record('Relic Tank', { faction: 'host', keywords: [], sizes: [1], legends: true }),
      'host.pack': record('Pack', { faction: 'host', keywords: [], sizes: [3, 6] }),
      'host.mixed-pack': record('Mixed Pack', { faction: 'host', keywords: [], sizes: [3, 6, 12] }),
      'host.assassin': record('Assassin', { faction: 'host', keywords: [], sizes: [1] }),
    },
    model: {
      'host.mixed-pack.hunter': record('Hunter', { unit: 'host.mixed-pack', min: 3, max: 12, wargear: {} }),
      'host.mixed-pack.hound': record('Hound', { unit: 'host.mixed-pack', min: 0, max: 3, wargear: {} }),
    },
  },
  points: [
    {
      id: 'test',
      factions: [
        {
          id: 'host',
          detachments: [{ id: 'host.guard', dp: 2, enhancements: [{ id: 'host.guard.banner', upgrade: true, points: 10 }] }],
          units: [
            {
              id: 'host.tank',
              name: 'Tank',
              tiers: [
                {
                  copies: { from: 1, to: 2 },
                  costs: [
                    { composition: 'as Imperium', models: 1, points: 120 },
                    { composition: 'in the Guard Detachment', models: 1, points: 90 },
                    { composition: 'in an army of Host', models: 1, points: 100 },
                  ],
                },
              ],
            },
            { id: 'host.relic-tank', name: 'Relic Tank', tiers: [{ copies: { from: 1 }, costs: [{ models: 1, points: 200 }] }] },
            {
              id: 'host.pack',
              name: 'Pack',
              tiers: [
                {
                  copies: { from: 1 },
                  costs: [
                    { models: 3, points: 60 },
                    { composition: '3 Hunter, 3 Hound', models: 6, points: 115 },
                    { composition: '6 Hunter, 0 Hound', models: 6, points: 170 },
                  ],
                },
              ],
            },
            {
              id: 'host.assassin',
              name: 'Assassin',
              tiers: [
                {
                  copies: { from: 1 },
                  costs: [
                    { composition: 'as Imperium', models: 1, points: 100 },
                    { composition: 'in the Guard Detachment', models: 1, points: 115 },
                  ],
                },
              ],
            },
            {
              id: 'host.mixed-pack',
              name: 'Mixed Pack',
              tiers: [
                {
                  copies: { from: 1 },
                  costs: [
                    { models: 3, points: 60 },
                    { models: 6, points: 115, mix: { 'host.mixed-pack.hunter': 3, 'host.mixed-pack.hound': 3 } },
                    { models: 6, points: 170, mix: { 'host.mixed-pack.hunter': 6 } },
                    { models: 12, points: 230 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
})
const names: Record<string, string> = {
  'bs-tank': 'Tank',
  'bs-relic': 'Relic Tank [Legends]',
  'bs-banner': 'Banner',
  'bs-pack': 'Pack',
  'bs-mixed-pack': 'Mixed Pack',
  'bs-assassin': 'Assassin',
  'bs-shared': 'Shared Tank',
  'bs-gone': 'Gone Tank',
}
const index = vsPointsIndex(
  definitions,
  {
    books: { 'bs-host': 'host', 'bs-other': 'other' },
    detachments: { 'bs-guard': 'host.guard' },
    units: {
      'bs-tank': 'host.tank',
      'bs-relic': 'host.relic-tank',
      'bs-pack': 'host.pack',
      'bs-mixed-pack': 'host.mixed-pack',
      'bs-assassin': 'host.assassin',
      'bs-shared': 'host.tank',
      'bs-other/bs-shared': 'host.relic-tank',
      'bs-gone': 'host.tank',
      'bs-other/bs-gone': 'host.unpriced-tank',
    },
    enhancements: { 'host.guard/bs-banner': 'host.guard.banner' },
  },
  null,
  (id) => names[id],
)
const price = (catalogueId: string, entryId: string, detachments: string[] = []) =>
  vsMfmUnit(index, catalogueId, entryId, detachments)?.pricing[0]?.costs[0]?.points

describe('vsMfmUnit', () => {
  it('prices a unit in its own army at that army’s row', () => {
    expect(price('bs-host', 'bs-tank')).toBe(100)
  })

  it('prices a unit at the row of a Detachment the list holds', () => {
    expect(price('bs-host', 'bs-tank', ['bs-guard'])).toBe(90)
  })

  it('prices a unit in another faction’s army at the row for other armies', () => {
    expect(price('bs-other', 'bs-tank')).toBe(120)
  })

  it('prices a datasheet as the unit its list’s book reads it as', () => {
    expect(price('legacy~bs-other', 'bs-shared')).toBe(200)
  })

  it('leaves a datasheet to the field manual where VS Data cannot price the unit its list’s book reads it as', () => {
    expect(vsMfmUnit(index, 'bs-other', 'bs-gone')).toBeNull()
  })

  it('reads a retained rules version’s book by its bare ID', () => {
    expect(price('legacy~bs-host', 'bs-tank')).toBe(100)
  })

  it('leaves a datasheet whose price at a size turns on its mix of models to the field manual', () => {
    expect(vsMfmUnit(index, 'bs-host', 'bs-pack')).toBeNull()
  })

  it('prices a datasheet whose mixed size gives each row’s mix from VS Data at its other sizes', () => {
    expect(vsMfmUnit(index, 'bs-host', 'bs-mixed-pack')?.pricing[0]?.costs).toEqual([
      { models: 3, points: 60 },
      { models: 12, points: 230 },
    ])
  })

  it('leaves a mixed size read by its size alone unpriced, never at the next size up', () => {
    expect(mfmPrice(vsMfmUnit(index, 'bs-host', 'bs-mixed-pack')!, 6, 1)).toBeNull()
  })

  it('prices a Warhammer Legends datasheet from VS Data', () => {
    expect(price('bs-host', 'bs-relic')).toBe(200)
  })
})

describe('vsCostRows', () => {
  it('prints a row for other armies unlabelled where no row is its own army’s, as the one its own list pays', () => {
    expect(vsCostRows(index, 'bs-host', 'bs-assassin')?.find((row) => row.cost === '100')).not.toHaveProperty('allied')
  })

  it('labels a row priced by its mix of models with their names', () => {
    expect(vsCostRows(index, 'bs-host', 'bs-mixed-pack')?.find((row) => row.cost === '115')?.mix).toBe('3 Hunter, 3 Hound')
  })
})

describe('vsMfmDetachment', () => {
  it('names an upgrade as the field manual does, from its points, so the builder knows it for one', () => {
    expect(vsMfmDetachment(index, 'bs-guard')).toEqual({
      name: 'Guard',
      dp: 2,
      enhancements: [{ name: 'Banner (Upgrade)', points: 10, id: 'host.guard.banner' }],
    })
  })
})
