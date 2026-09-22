import { describe, expect, it } from 'vitest'
import { combatRuleAppliesTo, combatRuleChoices, combatRuleDefault, combatRuleMortals, type CombatRule } from './combatRules'

const rule = (description: string, extra: Partial<CombatRule> = {}): CombatRule => ({
  id: 'ability',
  name: 'Ability',
  source: 'Unit',
  scope: 'unit',
  models: 1,
  description,
  ...extra,
})
const charge =
  'Each time this model ends a Charge move, select one enemy unit within Engagement Range of this model and roll one D6: on a 2-5, that unit suffers D3 mortal wounds; on a 6, that unit suffers D3+3 mortal wounds.'
const shooting =
  'At the start of your Shooting phase, select one enemy VEHICLE unit within 12" of this model and roll one D6: on a 2+, that enemy unit suffers D3 mortal wounds and this model regains up to that many lost wounds.'
const arcing =
  "In your Shooting phase, each time you select a target for this model's arc cannon, roll one D6 for the target unit and one D6 for every other enemy unit within 3\" of the target unit. On a 5+, the unit being rolled for is struck by arcing energies; after resolving all of this model's attacks against the target unit, each unit struck by arcing energies suffers D3 mortal wounds."

describe('separate mortal-wound abilities', () => {
  it('hides a vehicle-only ability when the chosen opponent is infantry', () =>
    expect(combatRuleAppliesTo(rule(shooting), 'attacker', ['Infantry'])).toBe(false))
  it('keeps charge mortals off until the player confirms the condition', () => expect(combatRuleDefault(rule(charge))).toBe(0))
  it('preserves the two charge roll outcomes before melee attacks', () => {
    expect(combatRuleChoices(rule(charge))).toEqual([
      {
        label: 'Charged this turn · Target in Engagement Range',
        effects: [
          {
            role: 'attacker',
            phases: ['melee'],
            mortalWounds: {
              timing: 'before',
              rolls: 1,
              outcomes: [
                { min: 2, max: 5, damage: { dice: 1, sides: 3, bonus: 0 } },
                { min: 6, max: 6, damage: { dice: 1, sides: 3, bonus: 3 } },
              ],
            },
          },
        ],
      },
    ])
  })
  it('uses surviving models rather than the starting size for per-model mortal rolls', () => {
    const buff = rule(
      'Each time this unit ends a Charge move, select one enemy unit within Engagement Range of this unit and roll one D6 for each model in this unit: for each 4+, that enemy unit suffers D3 mortal wounds.',
      { models: 6 },
    )
    const active = [{ name: 'Ability', effects: combatRuleChoices(buff)[0]!.effects }]
    expect(combatRuleMortals(active, 'melee', [], [], 3)[0]?.rolls).toBe(3)
  })
  it('keeps a shooting ability off targets without the required keyword', () => {
    const active = [{ name: 'Ability', effects: combatRuleChoices(rule(shooting))[0]!.effects }]
    expect(combatRuleMortals(active, 'ranged', ['Infantry'], [], 1)).toEqual([])
  })
  it('includes eligible shooting mortals before attacks', () => {
    const active = [{ name: 'Ability', effects: combatRuleChoices(rule(shooting))[0]!.effects }]
    expect(combatRuleMortals(active, 'ranged', ['Vehicle'], [], 1)).toEqual([
      { timing: 'before', rolls: 1, outcomes: [{ min: 2, max: 6, damage: { dice: 1, sides: 3, bonus: 0 } }] },
    ])
  })
  it('does not carry shooting mortals into the fight phase', () => {
    const active = [{ name: 'Ability', effects: combatRuleChoices(rule(shooting))[0]!.effects }]
    expect(combatRuleMortals(active, 'melee', ['Vehicle'], [], 1)).toEqual([])
  })
  it('does not add arcing mortals when its weapon is not being fired', () => {
    const active = [{ name: 'Ability', effects: combatRuleChoices(rule(arcing))[0]!.effects }]
    expect(combatRuleMortals(active, 'ranged', [], [{ profile: { name: 'Other cannon' } }], 1)).toEqual([])
  })
  it('resolves arcing mortals after the selected weapon attacks', () => {
    const active = [{ name: 'Ability', effects: combatRuleChoices(rule(arcing))[0]!.effects }]
    expect(combatRuleMortals(active, 'ranged', [], [{ profile: { name: 'Arc cannon' } }], 1)).toEqual([
      { timing: 'after', rolls: 1, outcomes: [{ min: 5, max: 6, damage: { dice: 1, sides: 3, bonus: 0 } }] },
    ])
  })
  it('does not enable a self-sacrificing ability without allocating the lost model', () => {
    expect(combatRuleChoices(rule(charge + ' This model is then destroyed.'))).toEqual([])
  })
  it('does not enable an unknown extra mortal effect', () => {
    expect(combatRuleChoices(rule(charge + ' Double the target damage.'))).toEqual([])
  })
})
