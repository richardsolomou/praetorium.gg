import { describe, expect, it } from 'vitest'
import { vsBuiltUnit } from './vsDataBuild'
import { vsDataDefinitions } from './vsDataConstruction'

const record = (name: string, data: Record<string, unknown>) => ({ name, data })
const definitions = vsDataDefinitions({
  release: 'test',
  rulesVersion: { edition: '11th', update: 'test' },
  unavailable: [],
  points: [],
  definitions: {
    unit: {
      squad: record('Squad', { faction: 'f', keywords: ['INFANTRY'], sizes: [5, 10] }),
      walker: record('Walker', { faction: 'f', keywords: ['VEHICLE'], sizes: [1, 2, 3] }),
      pair: record('Pair', { faction: 'f', keywords: ['INFANTRY'], sizes: [2], wargear: { token: 1 } }),
    },
    model: {
      'squad.sergeant': record('Sergeant', { unit: 'squad', min: 1, max: 1, wargear: { pistol: 1, sword: 1 } }),
      'squad.trooper': record('Trooper', { unit: 'squad', min: 4, max: 9, wargear: { pistol: 1, rifle: 1 } }),
      'walker.walker': record('Walker', { unit: 'walker', min: 1, max: 3, wargear: { 'fist-and-gun': 1 } }),
      'pair.leader': record('Leader', { unit: 'pair', min: 1, max: 1, wargear: { pistol: 1 } }),
      'pair.gunner': record('Gunner', { unit: 'pair', min: 1, max: 1, wargear: { rifle: 1 } }),
    },
    'roster-option': {
      'squad.special': record('Special weapon', {
        unit: 'squad',
        carrier: 'squad.trooper',
        choose: { min: 0, max: 2 },
        replaces: { rifle: 1 },
        choices: ['plasma'],
      }),
      'squad.icon': record('Icon', { unit: 'squad', carrier: 'squad.trooper', choose: { min: 0, max: 1 }, choices: ['icon'] }),
      'pair.swap': record('Swap', { unit: 'pair', choose: { min: 0, max: 1 }, replaces: { rifle: 1 }, choices: ['plasma'] }),
    },
    wargear: {
      pistol: record('Pistol', {}),
      sword: record('Sword', {}),
      rifle: record('Rifle', {}),
      plasma: record('Plasma gun', {}),
      icon: record('Icon', {}),
      token: record('Token', {}),
      'fist-and-gun': record('Fist and gun', { includes: { fist: 1, gun: 1 } }),
      fist: record('Fist', {}),
      gun: record('Gun', {}),
    },
  },
})

const squad = (options: Record<string, Record<string, number>> = {}) =>
  vsBuiltUnit(definitions, 'squad', { models: { 'squad.sergeant': 1, 'squad.trooper': 9 }, options })
const lines = (unit: ReturnType<typeof squad>) =>
  unit.carriers.map((carrier) => `${carrier.models} ${carrier.name}: ${carrier.weapons.map((w) => `${w.count} ${w.name}`).join(', ')}`)

describe('a VS pick built by VS Data', () => {
  it('splits the models taking a swap from those keeping what it replaces', () => {
    expect(lines(squad({ 'squad.special': { plasma: 2 } }))).toEqual([
      '1 Sergeant: 1 Pistol, 1 Sword',
      '7 Trooper: 7 Pistol, 7 Rifle',
      '2 Trooper: 2 Pistol, 2 Plasma gun',
    ])
  })

  it('gives an addition to one model of the largest group', () => {
    expect(lines(squad({ 'squad.special': { plasma: 2 }, 'squad.icon': { icon: 1 } }))[2]).toBe('1 Trooper: 1 Pistol, 1 Rifle, 1 Icon')
  })

  it('counts its wargear as VS Data carries it', () => {
    expect(squad({ 'squad.special': { plasma: 2 } }).wargear).toEqual([
      { name: 'Pistol', count: 10 },
      { name: 'Sword', count: 1 },
      { name: 'Rifle', count: 7 },
      { name: 'Plasma gun', count: 2 },
    ])
  })

  it('names the contents of a bundle in its place', () => {
    expect(vsBuiltUnit(definitions, 'walker', { models: { 'walker.walker': 2 }, options: {} }).wargear).toEqual([
      { name: 'Fist', count: 2 },
      { name: 'Gun', count: 2 },
    ])
  })

  it('gives an option without a carrier to the model holding what it replaces', () => {
    const pair = vsBuiltUnit(definitions, 'pair', { models: {}, options: { 'pair.swap': { plasma: 1 } } })
    expect(pair.carriers.find((carrier) => carrier.name === 'Gunner')?.weapons).toEqual([{ name: 'Plasma gun', count: 1 }])
  })

  it('keeps what the unit has rather than a model apart from its models', () => {
    const pair = vsBuiltUnit(definitions, 'pair', { models: {}, options: {} })
    expect(pair.carriers.at(-1)).toMatchObject({ unitWide: true, weapons: [{ name: 'Token', count: 1 }] })
  })

  it('gives each kind of model a row for each choice its options offer', () => {
    expect(squad({ 'squad.special': { plasma: 2 } }).models[1]?.rows.map((row) => row.name)).toContain('Plasma gun')
  })

  it('steps between sizes it cannot field every one of', () => {
    expect(squad().size).toEqual({ min: 5, max: 10, models: 10, options: [5, 10] })
  })

  it('steps by one model where it fields every size between its smallest and largest', () => {
    expect(vsBuiltUnit(definitions, 'walker', { models: { 'walker.walker': 2 }, options: {} }).size.options).toBeUndefined()
  })
})
