import { describe, expect, it } from 'vitest'
import { factionColour } from './FactionMark'

describe('faction colors', () => {
  it('uses the faction palette', () => {
    expect(factionColour('blood-angels')).toBe('#7c1414')
  })

  it('uses a neutral color for a new faction', () => {
    expect(factionColour('unknown')).toBe('#767e88')
  })
})
