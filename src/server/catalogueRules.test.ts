import { describe, expect, it } from 'vitest'
import { rulesNamed } from './catalogueRules'

describe('keyword rule definitions', () => {
  it.each(['Linked Fire', 'Harpooned', 'Reverberating Summons', 'Psychic Assassin', 'Plasma Warhead', 'Overcharge'])(
    'uses the datacards definition for %s when the catalogue omits it',
    (name) => {
      const rule = { name, description: 'Source definition.' }
      expect(rulesNamed({ index: { rules: new Map() }, datacards: { keywordRules: [rule] } }, [name])).toEqual([rule])
    },
  )

  it('keeps the catalogue definition when a fallback defines the same name', () => {
    const rule = { id: 'rule', name: 'Stealth', description: 'Catalogue definition.' }
    const source = {
      index: { rules: new Map([[rule.id, rule]]) },
      datacards: { keywordRules: [{ name: 'Stealth', description: 'Fallback definition.' }] },
    }
    expect(rulesNamed(source, ['Stealth'])).toEqual([{ name: 'Stealth', description: 'Catalogue definition.' }])
  })
})
