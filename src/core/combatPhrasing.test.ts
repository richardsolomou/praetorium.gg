import { expect, it } from 'vitest'
import { compileCombatRule } from './combatRuleCompiler'
import type { CombatRule } from './combatRules'

const rule = (description: string): CombatRule => ({ id: 'rule', name: 'Rule', source: 'Source', scope: 'unit', description, models: 1 })
const effects = (description: string) => compileCombatRule(rule(description))?.choices.flatMap((choice) => choice.effects)

it.each([
  [
    "This unit's melee attacks that target a unit (excluding MONSTER/VEHICLE units) have +1 AP.",
    [
      {
        role: 'attacker',
        phases: ['melee'],
        excludedTargetKeywords: ['MONSTER', 'VEHICLE'],
        characteristic: { kind: 'armour-penetration', add: -1 },
      },
    ],
  ],
  [
    "This unit's attacks that target an INFANTRY unit can: Re-roll hit rolls of 1. Re-roll wound rolls of 1.",
    [
      { role: 'attacker', phases: ['ranged', 'melee'], targetKeywords: ['INFANTRY'], options: { hitReroll: 'ones' } },
      { role: 'attacker', phases: ['ranged', 'melee'], targetKeywords: ['INFANTRY'], options: { woundReroll: 'ones' } },
    ],
  ],
  [
    'Your unit’s melee attacks have <b><k>[LETHAL HITS: MONSTER/VEHICLE]</k></b>.',
    [{ role: 'attacker', phases: ['melee'], targetKeywords: ['MONSTER', 'VEHICLE'], keyword: 'LETHAL HITS' }],
  ],
  [
    'Melee attacks that target your unit have -1 to <b>hit rolls</b>.',
    [{ role: 'defender', phases: ['melee'], options: { hitModifier: -1 } }],
  ],
  [
    'Friendly ADEPTUS CUSTODES units (excluding MONSTER/VEHICLE units) within 6" of this model can\n- Re-roll hit rolls of 1\n- Re-roll wound rolls of 1',
    [
      { role: 'attacker', phases: ['ranged', 'melee'], options: { hitReroll: 'ones' } },
      { role: 'attacker', phases: ['ranged', 'melee'], options: { woundReroll: 'ones' } },
    ],
  ],
])('reads the transcribed shorthand %s as its printed rule', (description, expected) => expect(effects(description)).toEqual(expected))

it("offers each readied ka'tah that changes an attack as a choice", () => {
  const katah = [
    "At the start of your Command phase, friendly ADEPTUS CUSTODES units with this ability become readied. A readied unit can use one of the ka'tah abilities below at its stated trigger. After using it, that unit is no longer readied.",
    '### Dacatarai\n\nWHEN: Start of the Fight phase.\n\nEFFECT: Your unit’s melee attacks that target an enemy unit (excluding <k>MONSTER/VEHICLE</k> units) can <b>re-roll hit rolls</b> of 1.',
    '### Kaptaris\n\nWHEN: Start of the Fight phase.\n\nEFFECT: Melee attacks that target your unit have -1 to <b>hit rolls</b>.',
    '### Conservai\n\nWHEN: Your Command phase.\n\nEFFECT: Until the end of the turn:\n\n- Starting an <b>action</b> does not prevent your unit from being <b>eligible to shoot</b>.',
  ].join('\n\n')
  expect(compileCombatRule(rule(katah))?.choices.map((choice) => choice.label)).toEqual(['Dacatarai', 'Kaptaris'])
})
