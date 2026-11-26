import { describe, expect, it } from 'vitest'
import { vsDataDefinitions } from '../core/vsDataConstruction'
import { vsMfmDetachment, vsMfmUnit, vsPointsIndex } from './vsDataPoints'

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
          ],
        },
      ],
    },
  ],
})
const names: Record<string, string> = {
  'bs-tank': 'Tank',
  'bs-relic': 'Relic Tank [Legends]',
  'bs-old': 'Old Tank [Legends]',
  'bs-banner': 'Banner',
  'bs-pack': 'Pack',
}
const index = vsPointsIndex(
  definitions,
  {
    books: { 'bs-host': 'host', 'bs-other': 'other' },
    detachments: { 'bs-guard': 'host.guard' },
    units: { 'bs-tank': 'host.tank', 'bs-relic': 'host.relic-tank', 'bs-old': 'host.tank', 'bs-pack': 'host.pack' },
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

  it('reads a retained rules version’s book by its bare ID', () => {
    expect(price('legacy~bs-host', 'bs-tank')).toBe(100)
  })

  it('leaves a Legends datasheet aliased to a current unit to the field manual too', () => {
    expect(vsMfmUnit(index, 'bs-host', 'bs-old')).toBeNull()
  })

  it('leaves a datasheet whose price at a size turns on its mix of models to the field manual', () => {
    expect(vsMfmUnit(index, 'bs-host', 'bs-pack')).toBeNull()
  })

  it('leaves a Legends datasheet to the field manual', () => {
    expect(vsMfmUnit(index, 'bs-host', 'bs-relic')).toBeNull()
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
