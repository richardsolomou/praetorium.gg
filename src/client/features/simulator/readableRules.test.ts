import { expect, it } from 'vitest'
import type { CombatRule } from '../../../core/combatRules'
import { combatFactsOf, combatReadingFor } from '../../../core/combatReading'
import { textToken } from '../../../core/sourceText'
import { readableRules } from './readableRules'

const words = 'Each time a model in this unit makes an attack, re-roll a Hit roll of 1.'
const rule: CombatRule = {
  id: 'unit:reroll',
  name: 'Re-roll',
  source: 'Unit rule',
  description: textToken({ file: '000000aa', transform: 'plain', hash: '0000000000000000' }),
  scope: 'unit',
}

it('uses a recorded combat reading without needing the summary', () => {
  const recorded = { ...rule, reading: combatReadingFor(combatFactsOf(words), rule)! }
  expect(readableRules([recorded])).toEqual([recorded])
})

it('leaves an uncompiled rule out of the simulator', () => {
  expect(readableRules([rule])).toEqual([])
})
