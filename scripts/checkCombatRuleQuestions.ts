import { TypeSafeClient } from '@typesafe-ai/sdk'
import { classifyCombatRules, type InventoryRule } from './combatRuleShortlist'

const cases: { name: string; description: string; expected: ('attacker' | 'defender')[] }[] = [
  {
    name: 'Enemy status menu',
    description:
      "While an enemy unit is within Infection Range of a friendly ARMY unit, it is Infected. Select one plague at the start of the battle. While an enemy unit is Infected, subtract 1 from its Toughness and apply the chosen plague.\n\nConfusion: Each time a model in this unit makes a ranged attack, its target has cover. Each time a model in this unit makes a melee attack, subtract 1 from the Hit roll.\n\nBrittleness: Worsen the Save characteristic of models in this unit by 1.\n\nSluggishness: Subtract 1 from this unit's Move and Objective Control characteristics.",
    expected: ['attacker', 'defender'],
  },
  { name: 'Flavour', description: 'Their blades reap a terrible harvest and their armour has endured a thousand wars.', expected: [] },
  { name: 'Movement', description: 'This unit can re-roll Advance and Charge rolls.', expected: [] },
  { name: 'Permission', description: 'This unit is eligible to shoot in a turn in which it Fell Back.', expected: [] },
  {
    name: 'Target protection',
    description: 'This unit can only be selected as the target of a ranged attack if the attacking model is within 12 inches.',
    expected: [],
  },
  { name: 'Allocation', description: 'Melee weapons equipped by this model have the [PRECISION] ability.', expected: [] },
  { name: 'Order', description: 'This unit has the Fights First ability.', expected: [] },
  { name: 'Reward', description: 'Each time this unit destroys an enemy unit, gain 1CP.', expected: [] },
  { name: 'Recovery', description: 'In your Command phase, return one destroyed model to this unit.', expected: [] },
  {
    name: 'Menu without damage',
    description: 'Select one stance: Pursuit lets this unit re-roll Charge rolls; Control adds 1 to its Objective Control characteristic.',
    expected: [],
  },
  { name: 'Range', description: 'Add 6 inches to the Range characteristic of ranged weapons equipped by this unit.', expected: [] },
  {
    name: 'Condition',
    description: 'While the target is within 12 inches, ranged weapons equipped by this unit have [SUSTAINED HITS D3].',
    expected: ['attacker'],
  },
  {
    name: 'Menu with damage',
    description:
      'Select one vow: Pursuit lets this unit re-roll Charge rolls; Challenge adds 1 to melee Wound rolls when the attack Strength is no greater than the target Toughness.',
    expected: ['attacker'],
  },
  {
    name: 'Enemy defence penalty',
    description:
      'While an enemy unit is within 6 inches of this unit, subtract 1 from its Toughness and worsen its Save characteristic by 1.',
    expected: ['attacker'],
  },
  {
    name: 'Enemy attack penalty',
    description:
      'While an enemy unit is within 6 inches of this unit, subtract 1 from Hit rolls for attacks made by models in that enemy unit.',
    expected: ['defender'],
  },
  {
    name: 'Prevention',
    description: 'Each time an attack is allocated to a model in this unit, halve the Damage characteristic of that attack.',
    expected: ['defender'],
  },
  {
    name: 'Support',
    description: 'While a friendly ARMY unit is within 6 inches of this model, models in that unit have Feel No Pain 5+.',
    expected: ['defender'],
  },
  {
    name: 'Damage and defence',
    description: 'Models in this unit have Feel No Pain 5+, and their melee weapons have the [LETHAL HITS] ability.',
    expected: ['attacker', 'defender'],
  },
  {
    name: 'Offensive mortals',
    description: 'After this unit ends a Charge move, roll one D6: on a 4+, the charged enemy unit suffers D3 mortal wounds.',
    expected: ['attacker'],
  },
]

const rows: InventoryRule[] = cases.map(({ name, description }) => ({
  name,
  description,
  sources: ['Synthetic validation'],
  scopes: ['unit'],
  roles: [],
  calculatedRoles: [],
  calculated: false,
  status: 'not-combat',
}))
const report = await classifyCombatRules(rows, {
  cacheDirectory: '.combat-rule-cache',
  client: new TypeSafeClient({ timeout: 15_000, retry: { maxRetries: 2, maxRetryAfterMs: 10_000 }, logLevel: 'off' }),
  concurrency: 4,
  maxRequests: cases.length,
})
const failures = report.rules.flatMap((row, index) => {
  const expected = cases[index]!.expected
  const wrong = (['attacker', 'defender'] as const).some((role) => {
    const probability = row.probabilities?.[role]
    return probability !== undefined && (expected.includes(role) ? probability <= 0.2 : probability >= 0.8)
  })
  return row.error || wrong ? [{ name: row.name, expected, probabilities: row.probabilities, error: row.error }] : []
})
const review = report.rules.filter((row) => row.uncertainRoles?.length).map((row) => ({ name: row.name, probabilities: row.probabilities }))
const unresolved = new Set([...failures, ...review].map((row) => row.name))
console.log(
  JSON.stringify({ cases: cases.length, resolved: cases.length - unresolved.size, failures, review, usage: report.summary }, null, 2),
)
if (!report.complete || failures.length) process.exitCode = 1
