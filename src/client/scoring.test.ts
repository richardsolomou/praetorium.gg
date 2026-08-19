import { describe, expect, it } from 'vitest'
import type { MissionAward } from './missionText'
import { type AwardTrigger, cardsDue, cardsDueFromTheirTurn, dueNow, finishesOnScore, momentsPassed, nextDraw } from './scoring'

const ANY: AwardTrigger = { timing: null, phase: null, playerTurn: null, roundMin: null, roundMax: null }
const trigger = (overrides: Partial<AwardTrigger>): AwardTrigger => ({ ...ANY, ...overrides })
const payout = (vp: number, on: Partial<AwardTrigger>): MissionAward => ({
  vp,
  per: null,
  mode: null,
  when: null,
  max: null,
  parameters: {},
  operator: null,
  operands: [],
  group: null,
  cumulative: false,
  trigger: trigger(on),
})
const at = (phase: string, round = 1, rounds = 5) => ({ phase, round, rounds }) as Parameters<typeof dueNow>[1]

describe('when a mission is asked about', () => {
  it('settles only the phase when a turn still has phases left', () => {
    expect(momentsPassed(at('command'))).toEqual(['end-of-phase'])
  })

  it('settles the turn as well when the last phase of it ends', () => {
    expect(momentsPassed(at('end'))).toContain('end-of-turn')
  })

  it('settles the battle when the last round ends', () => {
    expect(momentsPassed(at('end', 5))).toContain('end-of-battle')
  })

  it('leaves the battle unsettled before the last round', () => {
    expect(momentsPassed(at('end', 4))).not.toContain('end-of-battle')
  })

  it('does not ask about an end-of-turn card partway through the turn', () => {
    expect(dueNow(trigger({ timing: 'end-of-turn' }), at('shooting'), true)).toBe(false)
  })

  it('asks about an end-of-turn card as the turn is passed', () => {
    expect(dueNow(trigger({ timing: 'end-of-turn' }), at('end'), true)).toBe(true)
  })

  it('asks about a command-phase card only as the command phase ends', () => {
    expect(dueNow(trigger({ timing: 'end-of-phase', phase: 'command' }), at('command'), true)).toBe(true)
  })

  it('stays quiet about a command-phase card at the end of another phase', () => {
    expect(dueNow(trigger({ timing: 'end-of-phase', phase: 'command' }), at('fight'), true)).toBe(false)
  })

  it('stays quiet about a card that only pays on your own turn during theirs', () => {
    expect(dueNow(trigger({ timing: 'end-of-turn', playerTurn: 'your-turn' }), at('end'), false)).toBe(false)
  })

  it('asks about an opponent-turn card only during their turn', () => {
    expect(dueNow(trigger({ timing: 'end-of-turn', playerTurn: 'opponent-turn' }), at('end'), false)).toBe(true)
  })

  it('respects the round a card starts paying in', () => {
    expect(dueNow(trigger({ timing: 'end-of-turn', roundMin: 2 }), at('end', 1), true)).toBe(false)
  })

  it('respects the round a card stops paying in', () => {
    expect(dueNow(trigger({ timing: 'end-of-turn', roundMax: 1 }), at('end', 2), true)).toBe(false)
  })

  it('never schedules a payout the source gave no timing for', () => {
    expect(dueNow(ANY, at('end'), true)).toBe(false)
  })

  it('drops a card whose payouts are all for another moment', () => {
    const cards = [
      {
        key: 'later',
        name: 'Later',
        category: 'secondary' as const,
        awards: [payout(3, { timing: 'end-of-turn' })],
      },
    ]
    expect(cardsDue(at('command'), true, cards)).toEqual([])
  })

  it('keeps only the payouts that are due on a card that has several', () => {
    const cards = [
      {
        key: 'mixed',
        name: 'Mixed',
        category: 'primary' as const,
        awards: [payout(2, { timing: 'end-of-turn' }), payout(3, { timing: 'end-of-phase', phase: 'command' })],
      },
    ]
    expect(cardsDue(at('command'), true, cards)[0]?.awards.map((award) => award.vp)).toEqual([3])
  })

  it('settles what the opponent’s turn owed a card that pays on it', () => {
    const cards = [
      {
        key: 'guard',
        name: 'Guard',
        category: 'secondary' as const,
        awards: [payout(2, { timing: 'end-of-turn', playerTurn: 'opponent-turn' })],
      },
    ]
    expect(cardsDueFromTheirTurn(1, cards)).toHaveLength(1)
  })

  it('settles an either-turn card from their turn as well as your own', () => {
    const cards = [
      { key: 'kills', name: 'Kills', category: 'secondary' as const, awards: [payout(2, { timing: 'end-of-turn', playerTurn: 'either' })] },
    ]
    expect(cardsDueFromTheirTurn(1, cards)).toHaveLength(1)
  })

  it('leaves your own-turn cards to your own turn', () => {
    const cards = [
      {
        key: 'mine',
        name: 'Mine',
        category: 'secondary' as const,
        awards: [payout(3, { timing: 'end-of-turn', playerTurn: 'your-turn' })],
      },
    ]
    expect(cardsDueFromTheirTurn(1, cards)).toEqual([])
  })

  it('judges their turn against the round it was played in', () => {
    const cards = [
      {
        key: 'late',
        name: 'Late',
        category: 'secondary' as const,
        awards: [payout(3, { timing: 'end-of-turn', playerTurn: 'opponent-turn', roundMin: 2 })],
      },
    ]
    expect(cardsDueFromTheirTurn(1, cards)).toEqual([])
    expect(cardsDueFromTheirTurn(2, cards)).toHaveLength(1)
  })
})

describe('filling a tactical hand', () => {
  const card = (key: string, status = 'active') => ({ key, status })
  const deck = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]

  it('asks for a card when the hand is empty', () => {
    expect(nextDraw([], new Set(), deck)?.key).toBe('a')
  })

  it('does not ask twice for the one already in flight', () => {
    expect(nextDraw([], new Set(['a']), deck)?.key).toBe('b')
  })

  it('stops once enough are in flight to fill the hand', () => {
    expect(nextDraw([], new Set(['a', 'b']), deck)).toBeNull()
  })

  it('stops once the hand itself is full', () => {
    expect(nextDraw([card('a'), card('b')], new Set(['a', 'b']), deck)).toBeNull()
  })

  it('fills the one gap a scored card left, and only that one', () => {
    const held = [card('a', 'achieved'), card('b')]
    const first = nextDraw(held, new Set(), deck)
    expect(first?.key).toBe('c')
    expect(nextDraw(held, new Set([first?.key ?? '']), deck)).toBeNull()
  })

  it('asks for nothing once the deck is empty', () => {
    expect(nextDraw([], new Set(), [])).toBeNull()
  })
})

describe('when scoring finishes a card', () => {
  it('finishes a tactical secondary that paid out', () => {
    expect(finishesOnScore('secondary', 'tactical', 3)).toBe(true)
  })

  it('leaves a tactical secondary that paid nothing in the hand', () => {
    expect(finishesOnScore('secondary', 'tactical', 0)).toBe(false)
  })

  it('leaves a fixed secondary to score again', () => {
    expect(finishesOnScore('secondary', 'fixed', 3)).toBe(false)
  })

  it('never finishes the primary, which is played all battle', () => {
    expect(finishesOnScore('primary', 'tactical', 5)).toBe(false)
  })
})
