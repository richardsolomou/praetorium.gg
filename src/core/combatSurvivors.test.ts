import { describe, expect, it } from 'vitest'
import { combatAtHealth, combatSurvivors, validCombatSurvivors } from './combatSurvivors'
import type { Datasheet } from './datasheet'

const squad = [
  { name: 'Sergeant', models: 1, weapons: [{ name: 'Rifle', count: 1 }] },
  { name: 'Troopers', models: 4, weapons: [{ name: 'Rifle', count: 4 }] },
]
describe('combat survivors', () => {
  const armed: Datasheet = {
    profiles: [{ id: 'rifle', name: 'Rifle', type: 'Ranged Weapons', count: 5, values: [] }],
    abilities: [],
  } as unknown as Datasheet
  it('projects remaining attacks and health without changing frozen equipment', () => {
    const original = { sheet: armed, models: 5, carriers: squad }
    const live = combatAtHealth(original, { models: 3, startingModels: 5, damage: 1 })
    expect({
      models: live.models,
      startingModels: live.startingModels,
      damage: live.damage,
      rifles: live.sheet.profiles[0]!.count,
      frozen: original.sheet.profiles[0]!.count,
    }).toEqual({ models: 3, startingModels: 5, damage: 1, rifles: 3, frozen: 5 })
  })
  it('refuses to guess which mixed weapons survived', () => {
    const carriers = [...squad, { name: 'Gunner', models: 1, weapons: [{ name: 'Plasma', count: 1 }] }]
    expect(combatAtHealth({ sheet: armed, models: 6, carriers }, { models: 3, startingModels: 6, damage: 0 }).allocationRequired).toBe(true)
  })
  it('uses an explicit valid survivor allocation', () => {
    const selected = [squad[0]!, { ...squad[1]!, models: 2, weapons: [{ name: 'Rifle', count: 2 }] }]
    expect(
      combatAtHealth({ sheet: armed, models: 5, carriers: squad }, { models: 3, startingModels: 5, damage: 0 }, selected).carriers,
    ).toEqual(selected)
  })
  it('rejects explicit survivors that exceed the recorded casualties', () => {
    expect(
      combatAtHealth({ sheet: armed, models: 5, carriers: squad }, { models: 3, startingModels: 5, damage: 0 }, squad).allocationRequired,
    ).toBe(true)
  })
  const profiled = (wounds: number): Datasheet =>
    ({
      profiles: [2, wounds].map((value, index) => ({
        id: index ? 'trooper' : 'leader',
        name: index ? 'Trooper' : 'Leader',
        type: 'Unit',
        values: [
          { name: 'T', value: '4' },
          { name: 'Sv', value: '3+' },
          { name: 'W', value: String(value) },
        ],
      })),
      abilities: [],
    }) as unknown as Datasheet
  it('infers survivors across different identities when their evaluated defences and weapons are identical', () => {
    expect(
      combatSurvivors(
        [
          { ...squad[0]!, modelProfileIds: ['leader'] },
          { ...squad[1]!, modelProfileIds: ['trooper'] },
        ],
        3,
        profiled(2),
      )?.[0]?.models,
    ).toBe(3)
  })
  it('does not infer survivors across evaluated mixed defences even when their weapons are identical', () => {
    expect(
      combatSurvivors(
        [
          { ...squad[0]!, modelProfileIds: ['leader'] },
          { ...squad[1]!, modelProfileIds: ['trooper'] },
        ],
        3,
        profiled(3),
      ),
    ).toBeNull()
  })
  it('preserves the model profile identity when reducing one uniform group', () => {
    expect(combatSurvivors([{ ...squad[1]!, modelProfileIds: ['trooper'] }], 2)?.[0]?.modelProfileIds).toEqual(['trooper'])
  })
  it('requires allocation when differently profiled models have the same weapons', () => {
    expect(
      combatSurvivors(
        [
          { ...squad[0]!, modelProfileIds: ['leader'] },
          { ...squad[1]!, modelProfileIds: ['trooper'] },
        ],
        3,
      ),
    ).toBeNull()
  })
  it('rejects explicit survivors with a different defensive profile identity', () => {
    expect(
      validCombatSurvivors(
        [{ ...squad[1]!, modelProfileIds: ['trooper'] }],
        [{ ...squad[1]!, models: 2, weapons: [{ name: 'Rifle', count: 2 }], modelProfileIds: ['leader'] }],
        2,
      ),
    ).toBe(false)
  })
  it('preserves authoritative weapon profile links when reducing a uniform squad', () => {
    const carriers = [{ name: 'Troopers', models: 4, weapons: [{ name: 'Equipment label', count: 4, profileIds: ['profile'] }] }]
    expect(combatSurvivors(carriers, 2)).toEqual([
      { name: 'Troopers', models: 2, weapons: [{ name: 'Equipment label', count: 2, profileIds: ['profile'] }] },
    ])
  })
  it.each([0, 1])('accepts an explicit remaining unit-level weapon count of %s without adding models', (count) => {
    const carriers = [...squad, { name: 'Unit equipment', models: 0, unitWide: true, weapons: [{ name: 'Grenade', count: 1 }] }]
    const survivors = [
      squad[0]!,
      { ...squad[1]!, models: 2, weapons: [{ name: 'Rifle', count: 2 }] },
      { ...carriers[2]!, weapons: [{ name: 'Grenade', count }] },
    ]
    expect(validCombatSurvivors(carriers, survivors, 3)).toBe(true)
  })
  it('requires an explicit decision for unit-level equipment after casualties', () => {
    expect(
      combatSurvivors([...squad, { name: 'Unit equipment', models: 0, unitWide: true, weapons: [{ name: 'Grenade', count: 1 }] }], 3),
    ).toBeNull()
  })
  it('rejects surviving equipment linked to a different source profile', () => {
    const carriers = [{ name: 'Troopers', models: 4, weapons: [{ name: 'Rifle', count: 4, profileIds: ['rifle'] }] }]
    expect(
      validCombatSurvivors(carriers, [{ name: 'Troopers', models: 2, weapons: [{ name: 'Rifle', count: 2, profileIds: ['cannon'] }] }], 2),
    ).toBe(false)
  })
  it('reduces identical loadouts across differently named models', () => {
    expect(combatSurvivors(squad, 3)).toEqual([{ name: 'Sergeant', models: 3, weapons: [{ name: 'Rifle', count: 3 }] }])
  })
  it('requires allocation when a specialist might have died', () => {
    expect(combatSurvivors([{ ...squad[0]!, weapons: [{ name: 'Fist', count: 1 }] }, squad[1]!], 3)).toBeNull()
  })
  it('requires allocation for split weapons within one model group', () => {
    expect(
      combatSurvivors(
        [
          {
            name: 'Troopers',
            models: 4,
            weapons: [
              { name: 'Rifle', count: 3 },
              { name: 'Cannon', count: 1 },
            ],
          },
        ],
        3,
      ),
    ).toBeNull()
  })
  it('preserves a full strength loadout', () => expect(combatSurvivors(squad, 5)).toEqual(squad))
  it('accepts a chosen surviving sergeant and two troopers', () => {
    expect(validCombatSurvivors(squad, [squad[0]!, { ...squad[1]!, models: 2, weapons: [{ name: 'Rifle', count: 2 }] }], 3)).toBe(true)
  })
  it('rejects an allocation with too many models', () => expect(validCombatSurvivors(squad, squad, 3)).toBe(false))
  it('rejects weapons held by dead models', () => {
    expect(
      validCombatSurvivors(
        squad,
        [
          { ...squad[0]!, models: 0 },
          { ...squad[1]!, models: 3, weapons: [{ name: 'Rifle', count: 3 }] },
        ],
        3,
      ),
    ).toBe(false)
  })
  it('cannot discard mandatory weapons from surviving models', () => {
    expect(validCombatSurvivors(squad, [squad[0]!, { ...squad[1]!, models: 2, weapons: [{ name: 'Rifle', count: 1 }] }], 3)).toBe(false)
  })
})
