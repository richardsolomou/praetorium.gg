import { describe, expect, it } from 'vitest'
import { hiddenListGamePastAt, hiddenListGameOpen, latestHiddenListGameSealedBy } from './group'

const at = Date.parse
const game = { playsAt: null, revealedAt: null, supersededAt: null, timeZone: 'Asia/Nicosia' }

describe('a group game’s lifetime', () => {
  it('keeps an undated game open until reveal', () => {
    expect(hiddenListGamePastAt(game)).toBeNull()
  })

  it('uses the scheduled day when lists are revealed early', () => {
    expect(hiddenListGamePastAt({ ...game, playsAt: at('2026-10-28T17:00:00Z'), revealedAt: at('2026-10-25T16:00:00Z') })).toBe(
      at('2026-10-28T22:00:00Z'),
    )
  })

  it('uses the reveal day without a schedule', () => {
    expect(hiddenListGamePastAt({ ...game, revealedAt: at('2026-10-28T17:00:00Z') })).toBe(at('2026-10-28T22:00:00Z'))
  })

  it('ends an unrevealed scheduled game after its day', () => {
    expect(hiddenListGamePastAt({ ...game, playsAt: at('2026-10-28T17:00:00Z') })).toBe(at('2026-10-28T22:00:00Z'))
  })

  it('closes immediately when another game replaces it', () => {
    expect(hiddenListGamePastAt({ ...game, playsAt: at('2026-10-28T17:00:00Z'), supersededAt: at('2026-10-25T16:00:00Z') })).toBe(
      at('2026-10-25T16:00:00Z'),
    )
  })

  it('keeps the earlier day boundary when a replacement arrives later', () => {
    expect(hiddenListGamePastAt({ ...game, revealedAt: at('2026-10-25T16:00:00Z'), supersededAt: at('2026-10-28T17:00:00Z') })).toBe(
      at('2026-10-25T22:00:00Z'),
    )
  })

  it.each([
    ['2026-03-28T22:10:00Z', '2026-03-29T21:00:00Z'],
    ['2026-10-24T21:10:00Z', '2026-10-25T22:00:00Z'],
  ])('uses local midnight across daylight saving from %s', (revealedAt, expected) => {
    expect(hiddenListGamePastAt({ ...game, revealedAt: at(revealedAt) })).toBe(at(expected))
  })

  it('changes classification at the boundary', () => {
    const pastAt = at('2026-10-25T22:00:00Z')
    expect([hiddenListGameOpen({ pastAt }, pastAt - 1), hiddenListGameOpen({ pastAt }, pastAt)]).toEqual([true, false])
  })
})

describe('the game that asks a player to share their list', () => {
  const sealed = (token: string, revealedAt: number | null, userId = 'me') => ({ token, revealedAt, players: [{ userId, sealed: true }] })

  it('is the most recently revealed game they sealed for', () => {
    expect(latestHiddenListGameSealedBy([sealed('old', 1), sealed('new', 3), sealed('middle', 2)], 'me')?.token).toBe('new')
  })

  it('skips a newer game they sat out', () => {
    expect(latestHiddenListGameSealedBy([sealed('mine', 1), sealed('theirs', 2, 'them')], 'me')?.token).toBe('mine')
  })

  it('skips a game not yet revealed', () => {
    expect(latestHiddenListGameSealedBy([sealed('revealed', 1), sealed('sealing', null)], 'me')?.token).toBe('revealed')
  })
})
