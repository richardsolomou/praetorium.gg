import { describe, expect, it } from 'vitest'
import { vsDataDefinitions } from './vsDataConstruction'
import { vsFirstFielding, vsResized, vsUnitOptions, vsUnitProblems, vsWithChoice } from './vsDataUnit'

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const definitions = vsDataDefinitions({
  release: 'test',
  rulesVersion: { edition: '11th', update: 'test' },
  unavailable: [],
  points: [],
  definitions: {
    faction: { host: record('Host', {}) },
    unit: {
      'host.squad': record('Squad', { faction: 'host', keywords: [], sizes: [5, 10] }),
      'host.pack': record('Pack', { faction: 'host', keywords: [], sizes: [4] }),
    },
    model: {
      'host.squad.sergeant': record('Sergeant', { unit: 'host.squad', min: 1, max: 1, wargear: { 'host.squad.rifle': 1 } }),
      'host.squad.trooper': record('Trooper', {
        unit: 'host.squad',
        min: 4,
        max: 9,
        bySize: [
          { size: 5, min: 4, max: 4 },
          { size: 10, min: 9, max: 9 },
        ],
        wargear: { 'host.squad.rifle': 1 },
      }),
      'host.pack.hound': record('Hound', { unit: 'host.pack', min: 4, max: 4, wargear: {} }),
    },
    'roster-option': {
      'host.squad.heavy': record('Heavy', {
        unit: 'host.squad',
        carrier: 'host.squad.trooper',
        per: { models: 5 },
        choose: { min: 0, max: 1 },
        replaces: { 'host.squad.rifle': 1 },
        choices: ['host.squad.cannon'],
      }),
      'host.squad.blade': record('Blade', {
        unit: 'host.squad',
        carrier: 'host.squad.sergeant',
        per: 'carrier',
        choose: { min: 0, max: 1 },
        choices: ['host.squad.sword'],
      }),
      'host.squad.relic': record('Relic', {
        unit: 'host.squad',
        carrier: 'host.squad.sergeant',
        per: 'carrier',
        choose: { min: 0, max: 1 },
        choices: ['host.squad.crown'],
        requires: { option: 'host.squad.blade', choices: ['host.squad.sword'] },
      }),
      'host.pack.jaws': record('Jaws', {
        unit: 'host.pack',
        carrier: 'host.pack.hound',
        per: 'carrier',
        choose: { min: 1, max: 1 },
        uniform: true,
        choices: ['host.pack.fangs', 'host.pack.claws'],
      }),
    },
    wargear: {
      'host.squad.rifle': record('Rifle', {}),
      'host.squad.cannon': record('Cannon', {}),
      'host.squad.sword': record('Sword', {}),
      'host.squad.crown': record('Crown', {}),
      'host.pack.fangs': record('Fangs', {}),
      'host.pack.claws': record('Claws', {}),
    },
  },
})
const option = (unit: Parameters<typeof vsUnitOptions>[1], id: string) => vsUnitOptions(definitions, unit).find((o) => o.id === id)!

describe('vsFirstFielding', () => {
  it('meets a uniform option’s minimum with all of its first choice', () => {
    expect(vsFirstFielding(definitions, 'host.pack').options).toEqual({ 'host.pack.jaws': { 'host.pack.fangs': 4 } })
  })
})

describe('vsUnitOptions', () => {
  it('scales an option by the models in the unit', () => {
    const squad = vsResized(definitions, vsFirstFielding(definitions, 'host.squad'), 10)
    expect(option(squad, 'host.squad.heavy').bounds.max).toBe(2)
  })

  it('keeps an option closed until the one it requires is taken', () => {
    expect(option(vsFirstFielding(definitions, 'host.squad'), 'host.squad.relic').open).toBe(false)
  })
})

describe('vsWithChoice', () => {
  it('drops an option whose requirement the unit no longer takes', () => {
    const squad = vsFirstFielding(definitions, 'host.squad')
    const armed = vsWithChoice(definitions, squad, 'host.squad.blade', { 'host.squad.sword': 1 })
    const crowned = vsWithChoice(definitions, armed, 'host.squad.relic', { 'host.squad.crown': 1 })
    expect(vsWithChoice(definitions, crowned, 'host.squad.blade', {}).options).toEqual({})
  })
})

describe('vsResized', () => {
  it('trims an option to what a smaller unit allows', () => {
    const squad = vsResized(definitions, vsFirstFielding(definitions, 'host.squad'), 10)
    const heavy = vsWithChoice(definitions, squad, 'host.squad.heavy', { 'host.squad.cannon': 2 })
    expect(vsUnitProblems(definitions, vsResized(definitions, heavy, 5))).toEqual([])
  })
})
