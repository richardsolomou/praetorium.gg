import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { CombatRule } from '../../../core/combatRules'
import { combatFactsOf, combatReadingFor } from '../../../core/combatReading'
import { textToken } from '../../../core/sourceText'
import { readableRules } from './readableRules'

const words = 'Each time a model in this unit makes an attack, re-roll a Hit roll of 1.'
const tokenFor = (value: string) =>
  textToken({ file: '000000aa', transform: 'plain', hash: createHash('sha256').update(value).digest('hex').slice(0, 16) })
const rule = (description: string, keywords: string[] = []): CombatRule => ({
  id: 'stratagem:reroll',
  name: 'Re-roll',
  source: '1 CP',
  description,
  scope: 'stratagem',
  phases: ['ranged'],
  keywords,
})

describe('rules the simulator can compile on this device', () => {
  it('keeps a rule that carries its own words', () => {
    expect(readableRules([rule(words)])).toEqual([rule(words)])
  })

  it('leaves out a rule named by a token that nothing recorded', () => {
    expect(readableRules([rule(tokenFor(words))])).toEqual([])
  })

  it('keeps a rule named by a token whose reading the server recorded', () => {
    const placed = { ...rule(tokenFor(words)), phases: undefined }
    const recorded = { ...placed, reading: combatReadingFor(combatFactsOf(words), placed)! }
    expect(readableRules([recorded])).toEqual([recorded])
  })
})
