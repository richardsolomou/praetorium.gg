import { describe, expect, it } from 'vitest'
import { type VsDataConstruction, vsDataDefinitions } from './vsDataConstruction'
import { checkVsRoster, priceVsRoster, type VsRoster } from './vsDataRoster'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const construction: VsDataConstruction = {
  release: 'test',
  rulesVersion: { edition: '11th', update: 'test' },
  unavailable: [],
  definitions: {
    faction: { host: record('Host', {}), other: record('Other', {}) },
    'battle-size': { small: record('Small', { points: 500, enhancements: 1 }) },
    detachment: { 'host.guard': record('Guard', { faction: 'host' }) },
    unit: {
      'host.walker': record('Walker', { faction: 'host', keywords: ['VEHICLE'], sizes: [1] }),
      'host.captain': record('Captain', { faction: 'host', keywords: ['CHARACTER', 'INFANTRY'], sizes: [1] }),
      'host.hero': record('Hero', { faction: 'host', keywords: ['CHARACTER', 'EPIC HERO', 'INFANTRY'], sizes: [1] }),
      'host.agent': record('Agent', { faction: 'host', keywords: ['INFANTRY'], sizes: [1] }),
      'host.envoy': record('Envoy', { faction: 'host', keywords: ['INFANTRY'], sizes: [1] }),
    },
    model: {
      'host.walker.walker': record('Walker', {
        unit: 'host.walker',
        min: 1,
        max: 1,
        wargear: { 'host.walker.claw': 1, 'host.walker.cannon': 2 },
      }),
      'host.captain.captain': record('Captain', { unit: 'host.captain', min: 1, max: 1, wargear: { 'host.captain.shield': 1 } }),
      'host.hero.hero': record('Hero', { unit: 'host.hero', min: 1, max: 1, wargear: {} }),
      'host.agent.agent': record('Agent', { unit: 'host.agent', min: 1, max: 1, wargear: {} }),
      'host.envoy.envoy': record('Envoy', { unit: 'host.envoy', min: 1, max: 1, wargear: {} }),
    },
    'roster-option': {
      'host.walker.cannons': record('Cannons', {
        unit: 'host.walker',
        carrier: 'host.walker.walker',
        per: 'carrier',
        choose: { min: 0, max: 1 },
        replaces: { 'host.walker.cannon': 2 },
        choices: ['host.walker.two-lances'],
      }),
    },
    wargear: {
      'host.walker.claw': record('Claw', {}),
      'host.walker.cannon': record('Cannon', {}),
      'host.walker.lance': record('Lance', {}),
      'host.walker.two-lances': record('2 Lance', { includes: { 'host.walker.lance': 2 } }),
      'host.captain.shield': record('Shield', {}),
    },
    enhancement: {
      'host.guard.relic': record('Relic', {
        detachment: 'host.guard',
        type: 'model',
        eligibility: { anyOf: [{ keywords: ['INFANTRY'] }] },
      }),
      'host.guard.crown': record('Crown', {
        detachment: 'host.guard',
        type: 'model',
        eligibility: { anyOf: [{ keywords: ['INFANTRY'] }], epicHeroes: true },
      }),
      'host.guard.drill': record('Drill', {
        detachment: 'host.guard',
        type: 'upgrade',
        perRoster: 2,
        eligibility: { anyOf: [{ keywords: ['INFANTRY'] }], nonCharacters: true },
      }),
    },
  },
  points: [
    {
      id: 'test',
      factions: [
        {
          id: 'host',
          detachments: [
            {
              id: 'host.guard',
              dp: 1,
              enhancements: [
                { id: 'host.guard.relic', points: 15 },
                { id: 'host.guard.crown', points: 10 },
                { id: 'host.guard.drill', upgrade: true, points: 5 },
              ],
            },
          ],
          units: [
            {
              id: 'host.walker',
              name: 'Walker',
              tiers: [{ copies: { from: 1 }, costs: [{ models: 1, points: 100 }] }],
              wargear: [{ item: 'host.walker.lance', points: 5 }],
            },
            {
              id: 'host.captain',
              name: 'Captain',
              tiers: [{ copies: { from: 1 }, costs: [{ models: 1, points: 60 }] }],
              wargear: [{ item: 'host.captain.shield', points: 20 }],
            },
            {
              id: 'host.agent',
              name: 'Agent',
              tiers: [
                {
                  copies: { from: 1 },
                  costs: [
                    { composition: 'in an army of Host', models: 1, points: 40 },
                    { composition: 'as Imperium', models: 1, points: 50 },
                    { composition: 'in the Guard Detachment', models: 1, points: 30 },
                  ],
                },
              ],
            },
            {
              id: 'host.envoy',
              name: 'Envoy',
              tiers: [
                {
                  copies: { from: 1 },
                  costs: [
                    { composition: 'in an army of Other', models: 1, points: 20 },
                    { composition: '1 Envoy', models: 1, points: 25 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
const definitions = vsDataDefinitions(construction)
const roster = (units: VsRoster['units'], faction = 'host', detachments = ['host.guard']): VsRoster => ({
  faction,
  detachments,
  battleSize: 'small',
  units,
})

describe('priceVsRoster', () => {
  it('charges a priced item for each one a bundle the unit takes holds', () => {
    const walker = { unit: 'host.walker', options: { 'host.walker.cannons': { 'host.walker.two-lances': 1 } } }
    expect(priceVsRoster(definitions, roster([walker])).points).toBe(110)
  })

  it('charges a priced item a model carries by default', () => {
    expect(priceVsRoster(definitions, roster([{ unit: 'host.captain' }])).points).toBe(80)
  })

  it('prices a unit at the row naming one of the roster’s Detachments', () => {
    expect(priceVsRoster(definitions, roster([{ unit: 'host.agent' }])).points).toBe(30)
  })

  it('prices a unit at its own army’s row without that Detachment', () => {
    expect(priceVsRoster(definitions, roster([{ unit: 'host.agent' }], 'host', [])).points).toBe(40)
  })

  it('never prices a unit at a row naming another army', () => {
    expect(priceVsRoster(definitions, roster([{ unit: 'host.envoy' }])).points).toBe(25)
  })

  it('prices a unit in another faction’s army at the row for other armies', () => {
    expect(priceVsRoster(definitions, roster([{ unit: 'host.agent' }], 'other', [])).points).toBe(50)
  })
})

describe('checkVsRoster', () => {
  const codes = (units: VsRoster['units']) => checkVsRoster(definitions, roster(units)).map((problem) => problem.code)

  it('refuses an Enhancement to a unit that is not a Character', () => {
    expect(codes([{ unit: 'host.agent', enhancement: 'host.guard.relic' }])).toEqual(['enhancement-keywords'])
  })

  it('refuses an Enhancement to an Epic Hero', () => {
    expect(codes([{ unit: 'host.hero', enhancement: 'host.guard.relic' }])).toEqual(['enhancement-keywords'])
  })

  it('gives an Epic Hero an Enhancement that admits them', () => {
    expect(codes([{ unit: 'host.hero', enhancement: 'host.guard.crown' }])).toEqual([])
  })

  it('lets an upgrade go to as many units as it allows, outside the Enhancement limit', () => {
    expect(
      codes([
        { unit: 'host.captain', enhancement: 'host.guard.relic' },
        { unit: 'host.agent', enhancement: 'host.guard.drill' },
        { unit: 'host.agent', enhancement: 'host.guard.drill' },
      ]),
    ).toEqual([])
  })

  it('refuses an upgrade beyond the copies it allows', () => {
    const drilled = { unit: 'host.agent', enhancement: 'host.guard.drill' }
    expect(codes([drilled, drilled, drilled])).toEqual(['enhancement-repeated'])
  })

  it('refuses Enhancements beyond the battle size’s limit', () => {
    expect(
      codes([
        { unit: 'host.captain', enhancement: 'host.guard.relic' },
        { unit: 'host.captain', enhancement: 'host.guard.crown' },
      ]),
    ).toEqual(['enhancement-limit'])
  })
})
