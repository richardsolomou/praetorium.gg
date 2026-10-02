import { describe, expect, it } from 'vitest'
import type { Datasheet } from '../contracts/catalogue'
import type { CombatResult } from './combat'
import type { CombatCarrier } from './combatLoadout'
import { DEFAULT_COMBAT_OPTIONS } from './combat'
import { combatAttackInput, combatAttacks } from './combatScenario'
import {
  compareOutcomes,
  estimateKey,
  loadoutOdds,
  loadoutProfileOdds,
  loadoutSheet,
  optionEstimates,
  type LoadoutScore,
} from './combatLoadouts'

const result = (wipe: number, meanKills = 0, meanDamage = 0): CombatResult => ({ kills: [], damage: [], wipe, meanKills, meanDamage })
const squad = (weapons: Record<string, number>, models = 5): CombatCarrier[] => [
  { name: 'Trooper', models, weapons: Object.entries(weapons).map(([name, count]) => ({ name, count })) },
]

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
})

describe('option estimates', () => {
  const now = { ranged: result(0.2), melee: result(0.5) }
  const option = (entry: string, score: LoadoutScore, step: -1 | 0 | 1 = 0) => ({ group: 'pistol', entry, step, score })
  const pistol = [
    option('bolt', now),
    option('plasma', { ranged: result(0.4), melee: result(0.5) }),
    option('grip', { ranged: result(0.2), melee: result(0.5) }),
  ]
  const found = optionEstimates([pistol], now)
  it('estimates the option the unit already carries', () => {
    expect(found.get(estimateKey('pistol', 'bolt'))?.phases.ranged?.result.wipe).toBe(0.2)
  })
  it('marks the strongest option of a choice', () => {
    expect(found.get(estimateKey('pistol', 'plasma'))?.phases.ranged?.best).toBe(true)
  })
  it('leaves weaker options unmarked', () => {
    expect(found.get(estimateKey('pistol', 'grip'))?.phases.ranged?.best).toBe(false)
  })
  it('says nothing about a phase the choice does not change', () => {
    expect(found.get(estimateKey('pistol', 'plasma'))?.phases.melee).toBeUndefined()
  })
  it('marks the strongest option however small its lead', () => {
    const close = optionEstimates([[pistol[0]!, option('plasma', { ranged: result(0.201), melee: null })]], now)
    expect(close.get(estimateKey('pistol', 'plasma'))?.phases.ranged?.best).toBe(true)
  })
  it('marks the option the unit already carries when nothing beats it', () => {
    const weaker = optionEstimates([[pistol[0]!, option('grip', { ranged: result(0.1), melee: null })]], now)
    expect(weaker.get(estimateKey('pistol', 'bolt'))?.phases.ranged?.best).toBe(true)
  })
  it('compares options only within their own choice', () => {
    const other = { group: 'sword', entry: 'axe', step: 0 as const, score: { ranged: result(0.9), melee: null } }
    const apart = optionEstimates([pistol, [{ ...other, entry: 'blade', score: now }, other]], now)
    expect(apart.get(estimateKey('pistol', 'plasma'))?.phases.ranged?.best).toBe(true)
  })
  it('describes a squad option as one more model', () => {
    const step = optionEstimates([[option('bolt', now), option('plasma', { ranged: result(0.3), melee: null }, 1)]], now)
    expect(step.get(estimateKey('pistol', 'plasma'))?.step).toBe(1)
  })
})

describe('weapon profile odds', () => {
  const weapon = (id: string, carried?: number): Datasheet['profiles'][number] => ({
    id,
    name: id,
    type: 'Ranged Weapons',
    ...(carried ? { count: carried } : {}),
    values: Object.entries({ A: '2', BS: '3+', S: '4', AP: '-1', D: '1', Keywords: '-' }).map(([name, value]) => ({ name, value })),
  })
  const attacker = {
    id: 'unit',
    name: 'Squad',
    keywords: [],
    profiles: [weapon('Boltgun', 5)],
    abilities: [],
    keywordRules: [],
  } as unknown as Datasheet
  const target = { groups: [{ models: 10, toughness: 4, save: 3, invulnerable: null, wounds: 1 }], feelNoPain: null }
  const odds = loadoutProfileOdds(
    { carriers: squad({ Boltgun: 5 }), choices: [], weapons: [weapon('Boltgun'), weapon('Plasma gun')] },
    {
      sheet: attacker,
      models: 5,
      rules: [],
      opponent: { keywords: [], rules: [] },
      preferences: {},
      excluded: { ranged: [], melee: [] },
      phases: { ranged: { target, options: DEFAULT_COMBAT_OPTIONS, adjustment: {} }, melee: null },
    },
  )
  it('resolves a carried weapon at the count the unit carries', () => {
    expect(odds.get('Boltgun')?.result.meanDamage).toBeCloseTo(5 * 2 * (4 / 6) * (3 / 6) * (3 / 6), 10)
  })
  it("marks the strongest of one weapon's profiles", () => {
    const mode = (id: string, strength: string): Datasheet['profiles'][number] => ({
      id,
      name: `➤ Launcher - ${id}`,
      type: 'Ranged Weapons',
      count: 1,
      values: Object.entries({ A: '1', BS: '3+', S: strength, AP: '0', D: '1', Keywords: '-' }).map(([name, value]) => ({ name, value })),
    })
    const modes = loadoutProfileOdds(
      { carriers: [], choices: [], weapons: [] },
      {
        sheet: { ...attacker, profiles: [mode('Frag', '3'), mode('Krak', '8')] },
        models: 1,
        rules: [],
        opponent: { keywords: [], rules: [] },
        preferences: {},
        excluded: { ranged: [], melee: [] },
        phases: { ranged: { target, options: DEFAULT_COMBAT_OPTIONS, adjustment: {} }, melee: null },
      },
    )
    expect([modes.get('Frag')?.best, modes.get('Krak')?.best]).toEqual([false, true])
  })
  it('resolves a weapon the unit does not carry on one model', () => {
    expect(odds.get('Plasma gun')).toMatchObject({
      each: true,
      result: { meanDamage: expect.closeTo(2 * (4 / 6) * (3 / 6) * (3 / 6), 10) },
    })
  })
})

describe('loadout odds', () => {
  const weapon = (id: string, carried?: number, ap = '-1'): Datasheet['profiles'][number] => ({
    id,
    name: id,
    type: 'Ranged Weapons',
    ...(carried ? { count: carried } : {}),
    values: Object.entries({ A: '2', BS: '3+', S: '4', AP: ap, D: '1', Keywords: '-' }).map(([name, value]) => ({ name, value })),
  })
  const sheet = {
    id: 'unit',
    name: 'Squad',
    keywords: [],
    profiles: [weapon('Boltgun', 5)],
    abilities: [],
    keywordRules: [],
  } as unknown as Datasheet
  const target = { groups: [{ models: 10, toughness: 4, save: 3, invulnerable: null, wounds: 1 }], feelNoPain: null }
  const setup = { target, options: DEFAULT_COMBAT_OPTIONS, adjustment: {} }
  const scoring = {
    sheet,
    models: 5,
    rules: [],
    opponent: { keywords: [], rules: [] },
    preferences: {},
    excluded: { ranged: [], melee: [] },
    phases: { ranged: setup, melee: null },
  }
  const space = {
    carriers: squad({ Boltgun: 5 }),
    weapons: [weapon('Boltgun'), weapon('Plasma gun', undefined, '-3')],
    choices: [
      [
        { group: 'gun', entry: 'boltgun', step: 0 as const, carriers: squad({ Boltgun: 5 }) },
        { group: 'gun', entry: 'plasma', step: 1 as const, carriers: squad({ Boltgun: 4, 'Plasma gun': 1 }) },
      ],
    ],
  }
  const own = combatAttackInput(
    combatAttacks({ sheet, carriers: space.carriers, models: 5, rules: [] }, scoring.opponent, {}, scoring.excluded).ranged,
    target,
    DEFAULT_COMBAT_OPTIONS,
    {},
  )
  it("scores each option with its own carriers when the current loadout reproduces the matchup's attack", () => {
    expect(loadoutOdds(space, scoring, { ranged: own, melee: null }).estimates.get(estimateKey('gun', 'plasma'))?.phases.ranged?.best).toBe(
      true,
    )
  })
  it('estimates no option for an attack the current loadout does not reproduce', () => {
    expect(loadoutOdds(space, scoring, { ranged: null, melee: null }).estimates.size).toBe(0)
  })
})
