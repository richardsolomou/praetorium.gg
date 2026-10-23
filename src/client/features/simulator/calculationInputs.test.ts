import { describe, expect, it } from 'vitest'
import type { CombatantSnapshot } from '../../../core/combatMatchup'
import type { CombatRuleEffect } from '../../../core/combatRules'
import { calculationInputs } from './calculationInputs'

const effect = (phases: CombatRuleEffect['phases']) => ({ phases }) as CombatRuleEffect
const unit = (rules: CombatantSnapshot['rules'], companions?: CombatantSnapshot[]) =>
  ({ rules, companions, models: 1, carriers: [], sheet: {} }) as unknown as CombatantSnapshot

describe('what a phase estimate takes into account', () => {
  const attacker = unit(
    [{ name: 'Oath of Moment', effects: [effect(['ranged', 'melee'])] }],
    [unit([{ name: 'Rites of Battle', effects: [effect(['melee'])] }])],
  )
  const defender = unit([{ name: 'Armour of Contempt', effects: [effect(['ranged'])] }])

  it('names every active rule on both sides that acts in the phase, including attached units', () => {
    expect(calculationInputs('melee', { attacker, defender, choices: [], excluded: [] })).toEqual([
      'Attacker rules: Oath of Moment, Rites of Battle',
      'No defender rules',
    ])
  })

  it('names the chosen weapon choices and the weapons left out', () => {
    const choices = [
      {
        key: 'plasma',
        label: 'Plasma gun',
        value: 'hot',
        options: [
          { value: 'std', label: 'Standard' },
          { value: 'hot', label: '➤ Supercharge' },
        ],
      },
    ]
    expect(calculationInputs('ranged', { attacker, defender, choices, excluded: ['Bolt pistol'] })).toEqual([
      'Attacker rules: Oath of Moment',
      'Defender rules: Armour of Contempt',
      'Weapon choices: Plasma gun: Supercharge',
      'Left out: Bolt pistol',
    ])
  })
})
