import { describe, expect, it } from 'vitest'
import { completedSideRound } from './battleProgress'

describe('side turn progress', () => {
  const playing = (round: number, activePlayerId: string) =>
    ({
      status: 'playing',
      round,
      result: null,
      firstPlayerId: 'alice',
      activePlayerId,
    }) as const

  it('marks the first side complete while the second side plays the final round', () => {
    const view = playing(5, 'bob')

    expect(completedSideRound(view, ['alice'])).toBe(5)
    expect(completedSideRound(view, ['bob'])).toBe(4)
  })

  it('keeps the current round open while the first side plays', () => {
    const view = playing(5, 'alice')

    expect(completedSideRound(view, ['alice'])).toBe(4)
    expect(completedSideRound(view, ['bob'])).toBe(4)
  })

  it('marks every side complete when the battle finishes', () => {
    const view = {
      status: 'finished',
      round: 5,
      result: { reason: 'completed', concededBy: null },
      firstPlayerId: 'alice',
      activePlayerId: null,
    } as const

    expect(completedSideRound(view, ['alice'])).toBe(5)
  })

  it('does not complete an interrupted round when the battle finishes early', () => {
    const view = {
      status: 'finished',
      round: 4,
      result: { reason: 'finished-early', concededBy: null },
      firstPlayerId: 'alice',
      activePlayerId: null,
    } as const

    expect(completedSideRound(view, ['alice'])).toBe(3)
  })
})
