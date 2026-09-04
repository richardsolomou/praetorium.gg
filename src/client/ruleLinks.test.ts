import { describe, expect, it } from 'vitest'
import type { RuleIndex } from '../server/rulesCore'
import { ruleLinks } from './ruleLinks'

const reference = (document: string, code: string) => ({ code, document, section: 'moving', anchor: code, title: code })

const index = {
  documents: [{ id: 'core', slug: 'core-rules', title: 'Core Rules', updated: null, sections: [] }],
  references: [reference('core-rules', '03.01'), reference('core-rules', '10.05'), reference('combat-patrol', '03.01')],
  attribution: 'Data provided by game-datacards',
} satisfies RuleIndex

describe('where a quoted rule number leads', () => {
  it('leads to the rule the document being read prints', () => {
    expect(ruleLinks(index, 'combat-patrol').get('03.01')?.document).toBe('combat-patrol')
  })

  it('falls back to the core rules for a number the document does not print', () => {
    expect(ruleLinks(index, 'combat-patrol').get('10.05')?.document).toBe('core-rules')
  })

  it('leads nowhere for a number nothing prints', () => {
    expect(ruleLinks(index, 'core-rules').has('99.99')).toBe(false)
  })

  it('leads nowhere at all until the index has loaded', () => {
    expect(ruleLinks(null, 'core-rules').size).toBe(0)
  })
})
