import { describe, expect, it } from 'vitest'
import { type VsDataConstruction, vsDataDefinitions } from './vsDataConstruction'
import {
  checkVsRoster,
  keywordsOf,
  priceVsRoster,
  type VsRoster,
  vsHeldAbilities,
  vsNameLimitUnheld,
  vsUnitAllowance,
} from './vsDataRoster'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const construction: VsDataConstruction = {
  release: 'test',
  rulesVersion: { edition: '11th', update: 'test' },
  unavailable: [],
  definitions: {
    faction: {
      host: record('Host', {}),
      other: record('Other', {}),
      chapter: record('Chapter', { parent: 'host', excludedDetachments: ['host.guard'] }),
      titan: record('Titan', { withoutDetachments: { warlords: ['titan.engine.engine'] } }),
      band: record('Band', { unitLimits: [{ keywords: ['CHARACTER'], max: 1 }] }),
      keep: record('Keep', {
        allies: [
          {
            units: ['band.boss', 'host.walker'],
            oneLimit: true,
            limits: [
              { keywords: ['CHARACTER'], battleSize: 'small', max: 3 },
              { keywords: ['VEHICLE'], battleSize: 'small', max: 3 },
            ],
          },
        ],
      }),
      order: record('Order', { unitLimits: [{ keywords: ['EMPEROR’S CHAMPION'], max: 1 }] }),
      court: record('Court', {
        allies: [
          {
            units: ['band.boss', 'band.retinue'],
            limits: [{ keywords: ['CHARACTER'], battleSize: 'small', max: 1, free: [{ keywords: ['CHARACTER'], per: ['CREW'] }] }],
          },
        ],
      }),
    },
    'battle-size': { small: record('Small', { points: 500, enhancements: 1 }) },
    detachment: {
      'host.guard': record('Guard', { faction: 'host' }),
      'host.sworn': record('Sworn', { faction: 'host', warlords: ['host.oracle.oracle'] }),
      'host.watch': record('Watch', { faction: 'host', exclusiveEnhancements: { keywords: ['CHARACTER', 'INFANTRY'] } }),
    },
    unit: {
      'host.walker': record('Walker', { faction: 'host', keywords: ['VEHICLE'], sizes: [1] }),
      'host.captain': record('Captain', { faction: 'host', keywords: ['CHARACTER', 'INFANTRY'], sizes: [1] }),
      'host.hero': record('Hero', { faction: 'host', keywords: ['CHARACTER', 'EPIC HERO', 'INFANTRY'], sizes: [1] }),
      'host.rider': record('Rider', {
        faction: 'host',
        keywords: ['INFANTRY', 'CHARACTER'],
        sizes: [1],
        conditionalKeywords: [{ keywords: ['MOUNTED'], replaces: ['INFANTRY'], when: { wargear: 'host.rider.bike' } }],
        abilities: ['host.rider.charge', 'host.rider.oath'],
      }),
      'host.oracle': record('Oracle', { faction: 'host', keywords: ['CHARACTER', 'INFANTRY'], sizes: [1] }),
      'host.agent': record('Agent', { faction: 'host', keywords: ['INFANTRY'], sizes: [1] }),
      'host.envoy': record('Envoy', { faction: 'host', keywords: ['INFANTRY'], sizes: [1] }),
      'host.squad': record('Squad', { faction: 'host', keywords: ['INFANTRY'], sizes: [5] }),
      'host.pack': record('Pack', { faction: 'host', keywords: ['INFANTRY'], sizes: [6] }),
      'titan.engine': record('Engine', { faction: 'titan', keywords: ['TITANIC'], sizes: [1] }),
      'band.boss': record('Boss', { faction: 'band', keywords: ['CHARACTER', 'INFANTRY'], sizes: [1] }),
      'band.retinue': record('Retinue', { faction: 'band', keywords: ['INFANTRY'], sizes: [2] }),
      'court.crew': record('Crew', { faction: 'court', keywords: ['INFANTRY'], sizes: [1] }),
      'order.champion': record('Emperor’s Champion', { faction: 'order', keywords: ['CHARACTER', "EMPEROR'S CHAMPION"], sizes: [1] }),
      'order.herald': record('Emperor’s Champion', { faction: 'order', keywords: ['CHARACTER', 'EMPEROR’S CHAMPION'], sizes: [1] }),
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
      'host.rider.rider': record('Rider', { unit: 'host.rider', min: 1, max: 1, wargear: {} }),
      'host.oracle.oracle': record('Oracle', { unit: 'host.oracle', min: 1, max: 1, wargear: {}, warlord: false }),
      'host.agent.agent': record('Agent', { unit: 'host.agent', min: 1, max: 1, wargear: {} }),
      'host.envoy.envoy': record('Envoy', { unit: 'host.envoy', min: 1, max: 1, wargear: {} }),
      'host.squad.leader': record('Leader', { unit: 'host.squad', min: 1, max: 1, keywords: ['CHARACTER'], wargear: {} }),
      'host.squad.trooper': record('Trooper', { unit: 'host.squad', min: 4, max: 4, wargear: {} }),
      'host.pack.hunter': record('Hunter', { unit: 'host.pack', min: 3, max: 6, wargear: {} }),
      'host.pack.hound': record('Hound', { unit: 'host.pack', min: 0, max: 3, wargear: {} }),
      'titan.engine.engine': record('Engine', { unit: 'titan.engine', min: 1, max: 1, wargear: {} }),
      'band.boss.boss': record('Boss', { unit: 'band.boss', min: 1, max: 1, wargear: {} }),
      'band.retinue.master': record('Master', { unit: 'band.retinue', min: 1, max: 1, keywords: ['CHARACTER'], wargear: {} }),
      'band.retinue.follower': record('Follower', { unit: 'band.retinue', min: 1, max: 1, wargear: {} }),
      'court.crew.hand': record('Hand', { unit: 'court.crew', min: 1, max: 1, keywords: ['CREW'], wargear: {} }),
    },
    'roster-option': {
      'host.rider.mount': record('Mount', { unit: 'host.rider', choose: { min: 0, max: 1 }, choices: ['host.rider.bike'] }),
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
      'host.rider.bike': record('Bike', { rules: ['host.rider.charge'] }),
      'host.walker.cannon': record('Cannon', {}),
      'host.walker.lance': record('Lance', {}),
      'host.walker.two-lances': record('2 Lance', { includes: { 'host.walker.lance': 2 } }),
      'host.captain.shield': record('Shield', { rules: ['host.captain.ward'] }),
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
      'host.guard.banner': record('Banner', {
        detachment: 'host.guard',
        type: 'upgrade',
        perRoster: 3,
        eligibility: { anyOf: [{ keywords: ['INFANTRY'] }], nonCharacters: true },
      }),
      'host.guard.mark': record('Mark', {
        detachment: 'host.guard',
        type: 'upgrade',
        eligibility: { anyOf: [{ keywords: ['INFANTRY'] }], nonCharacters: true },
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
            {
              id: 'host.pack',
              name: 'Pack',
              tiers: [
                {
                  copies: { from: 1 },
                  costs: [
                    { composition: 'three and three', models: 6, points: 115, mix: { 'host.pack.hunter': 3, 'host.pack.hound': 3 } },
                    { composition: 'six', models: 6, points: 170, mix: { 'host.pack.hunter': 6 } },
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

  it('prices a unit at the row whose mix its model counts are', () => {
    const pack = { unit: 'host.pack', models: { 'host.pack.hunter': 6, 'host.pack.hound': 0 } }
    expect(priceVsRoster(definitions, roster([pack])).points).toBe(170)
  })
})

describe('keywordsOf', () => {
  const mounted = { unit: 'host.rider', models: { 'host.rider.rider': 1 }, options: { 'host.rider.mount': { 'host.rider.bike': 1 } } }

  it('gives a unit the keywords its wargear brings', () => {
    expect(keywordsOf(definitions, roster([mounted]), mounted)).toContain('MOUNTED')
  })

  it('takes away the keywords that wargear replaces', () => {
    expect(keywordsOf(definitions, roster([mounted]), mounted)).not.toContain('INFANTRY')
  })

  it('gives a unit read by its size alone no keyword by wargear', () => {
    const sized = { unit: 'host.rider', size: 1 }
    expect(keywordsOf(definitions, roster([sized]), sized)).toEqual(['INFANTRY', 'CHARACTER'])
  })
})

describe('checkVsRoster', () => {
  const codes = (units: VsRoster['units']) => checkVsRoster(definitions, roster(units)).map((problem) => problem.code)

  const courtCodes = (units: VsRoster['units']) => checkVsRoster(definitions, roster(units, 'court', [])).map((problem) => problem.code)

  it('counts an ally a Character model leads towards an allied CHARACTER limit', () => {
    expect(courtCodes([{ unit: 'band.boss' }, { unit: 'band.retinue' }])).toContain('ally-limit')
  })

  it('frees an allied CHARACTER for each unit whose model holds the keyword the allowance names', () => {
    expect(courtCodes([{ unit: 'band.boss' }, { unit: 'band.boss' }, { unit: 'court.crew' }])).not.toContain('ally-limit')
  })

  it('counts a unit a Character model leads towards a CHARACTER limit', () => {
    const band = roster([{ unit: 'band.boss' }, { unit: 'band.retinue' }], 'band', [])
    expect(checkVsRoster(definitions, band).map((problem) => problem.code)).toContain('unit-limit')
  })

  it('refuses an Enhancement to a unit that is not a Character', () => {
    expect(codes([{ unit: 'host.agent', enhancement: 'host.guard.relic' }])).toEqual(['enhancement-keywords'])
  })

  it('refuses an Enhancement to an Epic Hero', () => {
    expect(codes([{ unit: 'host.hero', enhancement: 'host.guard.relic' }])).toEqual(['enhancement-keywords'])
  })

  it('gives an Epic Hero an Enhancement that admits them', () => {
    expect(codes([{ unit: 'host.hero', enhancement: 'host.guard.crown' }])).toEqual([])
  })

  it('counts an upgrade’s first copy towards the Enhancement limit', () => {
    expect(
      codes([
        { unit: 'host.captain', enhancement: 'host.guard.relic' },
        { unit: 'host.agent', enhancement: 'host.guard.drill' },
      ]),
    ).toEqual(['enhancement-limit'])
  })

  it('leaves an upgrade’s further copies outside the Enhancement limit', () => {
    const drilled = { unit: 'host.agent', enhancement: 'host.guard.drill' }
    expect(codes([drilled, drilled])).toEqual([])
  })

  it('refuses a second copy of an upgrade whose facts allow one', () => {
    const marked = { unit: 'host.agent', enhancement: 'host.guard.mark' }
    expect(codes([marked, marked])).toEqual(['enhancement-repeated'])
  })

  it('refuses a fourth copy of an upgrade', () => {
    const bannered = { unit: 'host.agent', enhancement: 'host.guard.banner' }
    expect(codes([bannered, bannered, bannered, bannered])).toEqual(['enhancement-repeated'])
  })

  it('refuses the Warlord to a model its datasheet keeps from the role', () => {
    expect(codes([{ unit: 'host.oracle', warlord: 'host.oracle.oracle' }])).toEqual(['warlord-ineligible'])
  })

  it('gives the Warlord to such a model where a Detachment grants it', () => {
    expect(
      checkVsRoster(definitions, roster([{ unit: 'host.oracle', warlord: 'host.oracle.oracle' }], 'host', ['host.sworn'])).map(
        (problem) => problem.code,
      ),
    ).toEqual([])
  })

  it('keeps a unit a Detachment claims to that Detachment’s Enhancements', () => {
    expect(
      checkVsRoster(
        definitions,
        roster([{ unit: 'host.captain', enhancement: 'host.guard.relic' }], 'host', ['host.guard', 'host.watch']),
      ).map((problem) => problem.code),
    ).toEqual(['enhancement-exclusive'])
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

  it('refuses a parent’s Detachment the faction excludes', () => {
    expect(checkVsRoster(definitions, roster([], 'chapter')).map((problem) => problem.code)).toEqual(['detachment-excluded'])
  })

  it('refuses any Detachment to a faction that takes none', () => {
    const engine = { unit: 'titan.engine', warlord: 'titan.engine.engine' }
    expect(checkVsRoster(definitions, roster([engine], 'titan')).map((problem) => problem.code)).toContain('detachment-count')
  })

  it('needs the Warlord of a faction without Detachments to be one it names', () => {
    expect(checkVsRoster(definitions, roster([{ unit: 'titan.engine' }], 'titan', [])).map((problem) => problem.code)).toEqual([
      'warlord-required',
    ])
  })

  it('gives an Enhancement to a squad whose leader is a Character', () => {
    expect(codes([{ unit: 'host.squad', enhancement: 'host.guard.relic' }])).toEqual([])
  })

  it('lets a squad’s Character leader be the Warlord', () => {
    expect(codes([{ unit: 'host.squad', warlord: 'host.squad.leader' }])).toEqual([])
  })
})

describe('vsUnitAllowance', () => {
  it('allows another allied CHARACTER for each unit holding the keyword its allowance names', () => {
    expect(vsUnitAllowance(definitions, roster([{ unit: 'court.crew' }], 'court', []), 'band.boss').limit).toBe(2)
  })

  it('names the keywords that lift the ally limit holding a unit back', () => {
    expect(vsUnitAllowance(definitions, roster([], 'court', []), 'band.boss').unlockedBy).toBe('Crew')
  })

  it('takes no unit of an ally entry beside members of another of its limits where they must share one', () => {
    expect(vsUnitAllowance(definitions, roster([{ unit: 'host.walker' }], 'keep', []), 'band.boss').limit).toBe(0)
  })

  it('counts the roster’s other units against a shared keyword limit', () => {
    expect(vsUnitAllowance(definitions, roster([{ unit: 'band.retinue' }], 'band', []), 'band.boss').limit).toBe(0)
  })
})

describe('vsNameLimitUnheld', () => {
  it('finds a faction limit naming the unit in a spelling its keywords do not hold exactly', () => {
    expect(vsNameLimitUnheld(definitions, roster([], 'order', []), 'order.champion')).toBe(true)
  })

  it('leaves a unit whose keywords hold its faction’s name limit exactly', () => {
    expect(vsNameLimitUnheld(definitions, roster([], 'order', []), 'order.herald')).toBe(false)
  })
})

describe('vsHeldAbilities', () => {
  const rider = { unit: 'host.rider', models: { 'host.rider.rider': 1 } }

  it('holds the abilities the wargear a unit carries brings', () => {
    expect(vsHeldAbilities(definitions, { unit: 'host.captain', models: { 'host.captain.captain': 1 } })).toContain('host.captain.ward')
  })

  it('holds a unit’s own ability that no wargear brings', () => {
    expect(vsHeldAbilities(definitions, rider)).toContain('host.rider.oath')
  })

  it('holds an ability some wargear brings only with that wargear, though the unit names it', () => {
    expect(vsHeldAbilities(definitions, rider)).not.toContain('host.rider.charge')
  })
})
