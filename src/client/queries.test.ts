import { describe, expect, it } from 'vitest'
import { newestBattleScreen } from './queries'

describe('battle query ordering', () => {
  it('keeps the newer cached battle when an older refetch finishes late', () => {
    const current = { kind: 'battle', view: { seq: 13, cards: ['a', 'b'] } }
    const stale = { kind: 'battle', view: { seq: 12, cards: ['a'] } }

    expect(newestBattleScreen(current, stale)).toBe(current)
  })

  it('accepts a newer battle screen', () => {
    const current = { kind: 'battle', view: { seq: 12, cards: ['a'] } }
    const next = { kind: 'battle', view: { seq: 13, cards: ['a', 'b'] } }

    expect(newestBattleScreen(current, next)).toEqual(next)
  })
})
