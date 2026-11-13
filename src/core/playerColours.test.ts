import { describe, expect, it } from 'vitest'
import { playerColour, sideColours } from './playerColours'

describe('sideColours', () => {
  it('moves the second side off a colour of the same family as the first side’s', () => {
    const [, second] = sideColours([
      { id: 'one', colour: 'azure' },
      { id: 'two', colour: 'cobalt' },
    ])!
    expect(second.text).not.toBe('oklch(0.68 0.15 258)')
  })

  it('keeps both captains’ colours when their families differ', () => {
    expect(
      sideColours([
        { id: 'one', colour: 'azure' },
        { id: 'two', colour: 'emerald' },
      ])!.map((colour) => colour.text),
    ).toEqual(['oklch(0.78 0.13 235)', 'oklch(0.78 0.15 158)'])
  })

  it('puts Bone ink on a colour too deep for Void ink', () => {
    expect(
      sideColours([
        { id: 'one', colour: 'emerald' },
        { id: 'two', colour: 'lime' },
      ])!.map((colour) => colour.ink),
    ).toEqual(['var(--color-bone)', 'var(--color-void)'])
  })
})

describe('playerColour', () => {
  it('falls back to the colour from the id when the stored one is not in the palette', () => {
    expect(playerColour({ id: 'player-1', colour: 'gold' })).toBe(playerColour({ id: 'player-1' }))
  })
})
