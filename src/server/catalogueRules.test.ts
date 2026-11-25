import { describe, expect, it } from 'vitest'
import { rulesNamed } from '../shared/catalogueRules'

describe('keyword rule definitions', () => {
  it('names VS Data’s ability, with no text, for a keyword the catalogue omits', () => {
    expect(rulesNamed({ index: { rules: new Map() }, keywords: ['Linked Fire'] }, ['Linked Fire'])).toEqual([
      { name: 'Linked Fire', description: '' },
    ])
  })

  it('answers a parameterized keyword by its name', () => {
    expect(rulesNamed({ index: { rules: new Map() }, keywords: ['Sustained Hits'] }, ['Sustained Hits D3'])).toEqual([
      { name: 'Sustained Hits', description: '' },
    ])
  })

  it('keeps the catalogue definition when VS Data names the same keyword', () => {
    const rule = { id: 'rule', name: 'Stealth', description: 'Catalogue definition.' }
    expect(rulesNamed({ index: { rules: new Map([[rule.id, rule]]) }, keywords: ['Stealth'] }, ['Stealth'])).toEqual([
      { name: 'Stealth', description: 'Catalogue definition.' },
    ])
  })
})
