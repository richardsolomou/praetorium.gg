import { describe, expect, it } from 'vitest'
import { battleColours, playerColour } from './playerColours'

const text = (players: Parameters<typeof battleColours>[0]) => [...battleColours(players)!.players.values()].map((colour) => colour.text)

describe('battleColours', () => {
  it('moves the second side off a colour of the same family as the first side’s', () => {
    expect(
      text([
        { id: 'one', side: 0, colour: 'azure' },
        { id: 'two', side: 1, colour: 'cobalt' },
      ])[1],
    ).not.toBe('oklch(0.68 0.15 258)')
  })

  it('keeps both players’ colours when their families differ', () => {
    expect(
      text([
        { id: 'one', side: 0, colour: 'azure' },
        { id: 'two', side: 1, colour: 'emerald' },
      ]),
    ).toEqual(['oklch(0.78 0.13 235)', 'oklch(0.78 0.15 158)'])
  })

  it('keeps a teammate in their own colour rather than their captain’s', () => {
    expect(
      text([
        { id: 'one', side: 0, colour: 'azure' },
        { id: 'two', side: 1, colour: 'lemon' },
        { id: 'three', side: 1, colour: 'crimson' },
      ])[2],
    ).toBe('oklch(0.7 0.19 22)')
  })

  it('moves a teammate off a colour of the same family as anyone seated before them', () => {
    expect(
      new Set(
        text([
          { id: 'one', side: 0, colour: 'azure' },
          { id: 'two', side: 0, colour: 'ice' },
          { id: 'three', side: 1, colour: 'cobalt' },
        ]),
      ).size,
    ).toBe(3)
  })

  it('blends a side through every one of its players’ colours', () => {
    expect(
      battleColours([
        { id: 'one', side: 0, colour: 'azure' },
        { id: 'two', side: 1, colour: 'lemon' },
        { id: 'three', side: 1, colour: 'crimson' },
      ])!.variables['--side-b-blend'],
    ).toBe('linear-gradient(90deg, oklch(0.92 0.16 102), oklch(0.7 0.19 22))')
  })

  it('puts Bone ink on a colour too deep for Void ink', () => {
    expect(
      [
        ...battleColours([
          { id: 'one', side: 0, colour: 'emerald' },
          { id: 'two', side: 1, colour: 'lime' },
        ])!.players.values(),
      ].map((colour) => colour.ink),
    ).toEqual(['var(--color-bone)', 'var(--color-void)'])
  })
})

describe('playerColour', () => {
  it('falls back to the colour from the id when the stored one is not in the palette', () => {
    expect(playerColour({ id: 'player-1', colour: 'gold' })).toBe(playerColour({ id: 'player-1' }))
  })
})
