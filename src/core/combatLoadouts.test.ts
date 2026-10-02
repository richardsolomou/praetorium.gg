import { describe, expect, it } from 'vitest'
import type { Datasheet } from '../contracts/catalogue'
import type { CombatResult } from './combat'
import type { CombatCarrier } from './combatLoadout'
import {
  axisValues,
  carrierChange,
  compareOutcomes,
  composeCarriers,
  loadoutExplorer,
  loadoutPick,
  loadoutSheet,
  materiallyBetter,
  type LoadoutAxis,
  type LoadoutSpace,
} from './combatLoadouts'

const result = (wipe: number, meanKills = 0, meanDamage = 0): CombatResult => ({ kills: [], damage: [], wipe, meanKills, meanDamage })
const squad = (weapons: Record<string, number>, models = 5): CombatCarrier[] => [
  { name: 'Trooper', models, weapons: Object.entries(weapons).map(([name, count]) => ({ name, count })) },
]
const swap = (from: string, to: string): CombatCarrier[] => [
  {
    name: 'Trooper',
    models: 0,
    weapons: [
      { name: from, count: -1 },
      { name: to, count: 1 },
    ],
  },
]
const single = (key: string, current: string, options: [string, CombatCarrier[]][], host: string | null = null): LoadoutAxis => ({
  kind: 'single',
  key,
  name: key,
  owner: null,
  host,
  current,
  options: options.map(([id, change]) => ({ id, entry: id, name: id, group: key, count: 0, min: 0, max: 1, change })),
})
const spread = (options: { id: string; count: number; max: number; change?: CombatCarrier[] }[], room: number): LoadoutAxis => ({
  kind: 'spread',
  key: 'weapons',
  name: 'Weapons',
  owner: null,
  host: null,
  room,
  uniform: false,
  exact: true,
  donor: options[0]!.id,
  limits: [],
  options: options.map(({ id, count, max, change }) => ({
    id,
    entry: id,
    name: id,
    group: 'weapons',
    count,
    min: 0,
    max,
    change: change ?? [],
  })),
})
const count = (carriers: readonly CombatCarrier[], weapon: string) =>
  carriers.reduce((total, carrier) => total + (carrier.weapons.find((piece) => piece.name === weapon)?.count ?? 0), 0)

describe('loadout changes', () => {
  it('composes a measured change back into the loadout it was measured from', () => {
    const before = squad({ Boltgun: 5 })
    const after = squad({ Boltgun: 4, 'Plasma gun': 1 })
    expect(composeCarriers(before, [[carrierChange(before, after), 1]])).toEqual(after)
  })
  it('repeats a one-model change for each model that takes it', () => {
    expect(count(composeCarriers(squad({ Boltgun: 5 }), [[swap('Boltgun', 'Plasma gun'), 3]])!, 'Plasma gun')).toBe(3)
  })
  it('keeps equipment the unit holds as a whole', () => {
    const unitWide: CombatCarrier = { name: 'Squad equipment', models: 0, unitWide: true, weapons: [{ name: 'Mortar', count: 1 }] }
    expect(composeCarriers([...squad({ Boltgun: 5 }), unitWide], [[swap('Boltgun', 'Plasma gun'), 1]])).toContainEqual(unitWide)
  })
  it('keeps weapons of one name apart when they come from different profiles', () => {
    const carriers: CombatCarrier[] = [
      {
        name: 'Trooper',
        models: 2,
        weapons: [
          { name: 'Combi-weapon', count: 1, profileIds: ['bolter'] },
          { name: 'Combi-weapon', count: 1, profileIds: ['flamer'] },
        ],
      },
    ]
    expect(composeCarriers(carriers, [])![0]!.weapons).toEqual(carriers[0]!.weapons)
  })
  it('refuses a combination that would remove weapons the unit does not carry', () => {
    expect(composeCarriers(squad({ Boltgun: 1 }), [[swap('Boltgun', 'Plasma gun'), 2]])).toBeNull()
  })
})

describe('loadout values', () => {
  it('starts every choice from its current value', () => {
    expect(
      axisValues(
        single('pistol', 'bolt', [
          ['bolt', []],
          ['plasma', []],
        ]),
        10,
      )[0],
    ).toBe('bolt')
  })
  it('keeps every split of a squad within the room the donor gives up', () => {
    const values = axisValues(
      spread(
        [
          { id: 'boltgun', count: 4, max: 4 },
          { id: 'plasma', count: 0, max: 2 },
          { id: 'melta', count: 0, max: 2 },
        ],
        4,
      ),
      100,
    ) as Record<string, number>[]
    expect(values.every((value) => (value.boltgun ?? 0) + (value.plasma ?? 0) + (value.melta ?? 0) === 4)).toBe(true)
  })
  it('counts specialists against the model entry that limits them', () => {
    const axis = {
      ...spread(
        [
          { id: 'boltgun', count: 4, max: 4 },
          { id: 'plasma', count: 0, max: 2 },
          { id: 'melta', count: 0, max: 2 },
        ],
        4,
      ),
      limits: [{ options: ['plasma', 'melta'], max: 1 }],
    }
    expect((axisValues(axis, 100) as Record<string, number>[]).every((value) => value.plasma! + value.melta! <= 1)).toBe(true)
  })
  it('offers a whole-squad choice only as one option for every model', () => {
    const axis = {
      ...spread(
        [
          { id: 'gauss', count: 3, max: 3 },
          { id: 'tesla', count: 0, max: 3 },
        ],
        3,
      ),
      uniform: true,
    }
    expect(axisValues(axis, 100)).toEqual([
      { gauss: 3, tesla: 0 },
      { gauss: 0, tesla: 3 },
    ])
  })
})

describe('loadout picks', () => {
  const axes = [
    single('pistol', 'bolt', [
      ['bolt', []],
      ['plasma', []],
    ]),
    spread(
      [
        { id: 'boltgun', count: 4, max: 4 },
        { id: 'plasma', count: 0, max: 2 },
      ],
      4,
    ),
  ]
  it('writes a changed either-or choice by its catalogue option', () => {
    expect(loadoutPick({ entryId: 'unit' }, axes, ['plasma', { boltgun: 4, plasma: 0 }]).choices).toEqual({ pistol: 'plasma' })
  })
  it('writes every count of a changed squad split', () => {
    expect(loadoutPick({ entryId: 'unit' }, axes, ['bolt', { boltgun: 3, plasma: 1 }]).spreads).toEqual({
      weapons: { boltgun: 3, plasma: 1 },
    })
  })
  it('leaves the pick unchanged for the current values', () => {
    expect(loadoutPick({ entryId: 'unit', choices: { other: 'x' } }, axes, ['bolt', { boltgun: 4, plasma: 0 }])).toEqual({
      entryId: 'unit',
      choices: { other: 'x' },
      spreads: {},
    })
  })
})

describe('loadout datasheets', () => {
  const profile = (name: string): Datasheet['profiles'][number] => ({ id: name, name, type: 'Ranged Weapons', values: [] })
  const sheet = { name: 'Squad', profiles: [{ id: 'unit', name: 'Squad', type: 'Unit', values: [] }], keywords: [] } as unknown as Datasheet
  it('counts each weapon profile from the models that carry it', () => {
    const counted = loadoutSheet(sheet, [profile('Boltgun'), profile('Plasma gun')], squad({ Boltgun: 4, 'Plasma gun': 1 }))
    expect(counted.profiles.map((entry) => [entry.name, entry.count])).toEqual([
      ['Squad', undefined],
      ['Boltgun', 4],
      ['Plasma gun', 1],
    ])
  })
  it("keeps profile variants the matchup's own datasheet tells apart", () => {
    const variants = {
      ...sheet,
      profiles: [...sheet.profiles, { ...profile('Blade'), id: 'trooper-blade' }, { ...profile('Blade'), id: 'leader-blade' }],
    }
    const carriers: CombatCarrier[] = [
      { name: 'Trooper', models: 4, weapons: [{ name: 'Blade', count: 4, profileIds: ['trooper-blade'] }] },
      { name: 'Leader', models: 1, weapons: [{ name: 'Blade', count: 1, profileIds: ['leader-blade'] }] },
    ]
    expect(
      loadoutSheet(variants, [{ ...profile('Blade'), id: 'trooper-blade' }], carriers).profiles.map((entry) => [entry.id, entry.count]),
    ).toEqual([
      ['unit', undefined],
      ['trooper-blade', 4],
      ['leader-blade', 1],
    ])
  })
  it('leaves out weapons nobody carries', () => {
    expect(
      loadoutSheet(sheet, [profile('Boltgun'), profile('Meltagun')], squad({ Boltgun: 5 })).profiles.map((entry) => entry.name),
    ).toEqual(['Squad', 'Boltgun'])
  })
})

describe('outcome order', () => {
  it('prefers the likelier wipe over more models destroyed', () => {
    expect(compareOutcomes(result(0.5, 1), result(0.4, 3))).toBeGreaterThan(0)
  })
  it('prefers more models destroyed when the wipe chance is equal', () => {
    expect(compareOutcomes(result(0, 2, 2), result(0, 1, 5))).toBeGreaterThan(0)
  })
  it('falls back to wounds when wipes and models are equal', () => {
    expect(compareOutcomes(result(0, 1, 3), result(0, 1, 2))).toBeGreaterThan(0)
  })
  it('does not suggest a gain too small to matter', () => {
    expect(materiallyBetter(result(1), result(0.999))).toBe(false)
  })
  it('suggests a gain in models when the wipe chance barely moves', () => {
    expect(materiallyBetter(result(0.001, 1.2), result(0, 1))).toBe(true)
  })
  it('does not suggest a loadout that destroys the unit less often for more wounds', () => {
    expect(materiallyBetter(result(0.2, 1, 9), result(0.3, 1, 2))).toBe(false)
  })
})

describe('loadout search', () => {
  const space = (axes: LoadoutAxis[], carriers = squad({ Boltgun: 5 })): LoadoutSpace => ({ carriers, axes, weapons: [] })
  const plasma = spread(
    [
      { id: 'boltgun', count: 5, max: 5 },
      { id: 'plasma', count: 0, max: 2, change: swap('Boltgun', 'Plasma gun') },
    ],
    5,
  )
  const byPlasma = (carriers: CombatCarrier[]) => {
    const score = result(count(carriers, 'Plasma gun') / 10)
    return { ranged: score, melee: null }
  }
  it('finds the strongest split of a squad', () => {
    expect(loadoutExplorer(space([plasma]), byPlasma).search(5).ranged.ranked[0]!.assignment).toEqual([{ boltgun: 3, plasma: 2 }])
  })
  it('says a small space was searched completely', () => {
    expect(loadoutExplorer(space([plasma]), byPlasma).search(5).ranged.complete).toBe(true)
  })
  it('improves one choice at a time when a space is too large to search completely', () => {
    const found = loadoutExplorer(space([plasma]), byPlasma, { exhaustive: 1 }).search(5).ranged
    expect([found.complete, found.ranked[0]!.assignment]).toEqual([false, [{ boltgun: 3, plasma: 2 }]])
  })
  it('keeps the smaller change when another choice does not alter the result', () => {
    const grip = single('grip', 'plain', [
      ['plain', []],
      ['ornate', [{ name: 'Trooper', models: 0, weapons: [{ name: 'Grip', count: 1 }] }]],
    ])
    const shared = new Map<number, CombatResult>()
    const score = (carriers: CombatCarrier[]) => {
      const plasmas = count(carriers, 'Plasma gun')
      if (!shared.has(plasmas)) shared.set(plasmas, result(plasmas / 10))
      return { ranged: shared.get(plasmas)!, melee: null }
    }
    expect(
      loadoutExplorer(space([plasma, grip]), score)
        .search(5)
        .ranged.ranked.map((entry) => entry.assignment),
    ).toEqual([
      [{ boltgun: 3, plasma: 2 }, 'plain'],
      [{ boltgun: 4, plasma: 1 }, 'plain'],
      [{ boltgun: 5, plasma: 0 }, 'plain'],
    ])
  })
  it('only varies a nested choice while the choice offering it keeps its current value', () => {
    const parent = single('parent', 'sword', [
      ['sword', []],
      ['axe', swap('Boltgun', 'Axe')],
    ])
    const nested = single(
      'parent/sword/edge',
      'dull',
      [
        ['dull', []],
        ['keen', swap('Boltgun', 'Keen edge')],
      ],
      'parent',
    )
    const score = (carriers: CombatCarrier[]) => ({ ranged: result(count(carriers, 'Axe') + count(carriers, 'Keen edge')), melee: null })
    const ranked = loadoutExplorer(space([parent, nested]), score).search(10).ranged.ranked
    expect(ranked.some((entry) => entry.assignment[0] === 'axe' && entry.assignment[1] === 'keen')).toBe(false)
  })
})
