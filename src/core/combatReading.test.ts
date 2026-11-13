import { describe, expect, it } from 'vitest'
import { combatFactsOf, combatReadingFor, combatReadingOf, unquotedLabel } from './combatReading'
import type { CombatReading, CombatRule } from './combatRules'

const texts = [
  'When a friendly ADEPTUS CUSTODES unit is selected to attack, its attacks can re-roll one hit roll and one wound roll.',
  "Friendly SCOUT units have Deep Strike. When a friendly SCOUT unit is selected to shoot, if that unit made an ingress move this turn, that unit's ranged attacks have +1 to hit rolls.",
  'In your Shooting phase, select one friendly ARMY unit within 6" of this model. Until the end of the phase, each time a model in that unit makes an attack, add 1 to the Hit roll.',
  'While this model is leading a unit, each time a model in that unit makes an attack, re-roll a Hit roll of 1.',
]
const placements = (['unit', 'attached', 'nearby', 'detachment'] as const).flatMap((scope) =>
  [1, 5].flatMap((models) =>
    [undefined, ['Adeptus Custodes'], ['Scout', 'Infantry'], ['Army'], ['Vehicle']].map((keywords) => ({ scope, models, keywords })),
  ),
)

// What travels without the words labels a choice without quoting them.
const unquoted = (reading: CombatReading, words: string) => {
  const labelled = (choices: CombatReading['legacy']) => choices.map((choice) => ({ ...choice, label: unquotedLabel(choice.label, words) }))
  return {
    ...reading,
    compiled: reading.compiled && { ...reading.compiled, choices: labelled(reading.compiled.choices) },
    legacy: labelled(reading.legacy),
  }
}

describe('combat facts', () => {
  it.each(texts)('read every placement of %s as its words do', (description) => {
    const facts = combatFactsOf(description)
    for (const placement of placements) {
      const rule: CombatRule = { id: 'rule', name: 'Rule', source: 'Source', description, ...placement }
      expect(combatReadingFor(facts, rule)).toEqual(unquoted(combatReadingOf(rule), description))
    }
  })
})
