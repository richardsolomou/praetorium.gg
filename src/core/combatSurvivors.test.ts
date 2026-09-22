import { describe, expect, it } from 'vitest'
import { combatSurvivors, validCombatSurvivors } from './combatSurvivors'

const squad = [
  { name: 'Sergeant', models: 1, weapons: [{ name: 'Rifle', count: 1 }] },
  { name: 'Troopers', models: 4, weapons: [{ name: 'Rifle', count: 4 }] },
]
describe('combat survivors', () => {
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
