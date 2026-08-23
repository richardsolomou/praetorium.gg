import { describe, expect, it } from 'vitest'
import type { MissionAward } from './missionText'
import {
  type AwardTrigger,
  capRoom,
  cardsDue,
  cardsDueFromTheirTurn,
  dueNow,
  finishesOnScore,
  momentsPassed,
  nextDraw,
  scoredThisRound,
  settleAgainstCaps,
  turnPrompt,
} from './scoring'

const ANY: AwardTrigger = { timing: null, phase: null, playerTurn: null, roundMin: null, roundMax: null }
const trigger = (overrides: Partial<AwardTrigger>): AwardTrigger => ({ ...ANY, ...overrides })
const payout = (vp: number, on: Partial<AwardTrigger>): MissionAward => ({
  vp,
  per: null,
  mode: null,
  max: null,
  group: null,
  cumulative: false,
  criteria: null,
  trigger: trigger(on),
})
const at = (phase: string, round = 1, rounds = 5) => ({ phase, round, rounds }) as Parameters<typeof dueNow>[1]

describe('round scoring guidance', () => {
  it('uses only the applicable round total as already scored', () => {
    const currentRound = { primary: 10, secondary: 8 }
    expect(scoredThisRound(currentRound, 'primary')).toBe(10)
    expect(scoredThisRound(currentRound, 'secondary')).toBe(8)
  })
})

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

  it('keeps primary scoring in the command phase through round 4', () => {
    const cards = [
      {
        key: 'primary',
        name: 'Primary',
        category: 'primary' as const,
        awards: [payout(5, { timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn' })],
      },
    ]
    expect(cardsDue(at('command', 4), true, cards)).toHaveLength(1)
    expect(cardsDue(at('end', 4), true, cards)).toEqual([])
  })

  it('moves primary scoring to the end of your turn in round 5', () => {
    const cards = [
      {
        key: 'primary',
        name: 'Primary',
        category: 'primary' as const,
        awards: [payout(5, { timing: 'end-of-phase', phase: 'command', playerTurn: 'your-turn' })],
      },
    ]
    expect(cardsDue(at('command', 5), true, cards)).toEqual([])
    expect(cardsDue(at('end', 5), true, cards)).toHaveLength(1)
    expect(cardsDue(at('end', 5), false, cards)).toEqual([])
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
    expect(cardsDueFromTheirTurn(1, cards, ['guard'])).toHaveLength(1)
  })

  it('settles an either-turn card from their turn as well as your own', () => {
    const cards = [
      { key: 'kills', name: 'Kills', category: 'secondary' as const, awards: [payout(2, { timing: 'end-of-turn', playerTurn: 'either' })] },
    ]
    expect(cardsDueFromTheirTurn(1, cards, ['kills'])).toHaveLength(1)
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
    expect(cardsDueFromTheirTurn(1, cards, ['mine'])).toEqual([])
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
    expect(cardsDueFromTheirTurn(1, cards, ['late'])).toEqual([])
    expect(cardsDueFromTheirTurn(2, cards, ['late'])).toHaveLength(1)
  })

  it('never asks about a card dealt after that turn had already ended', () => {
    const cards = [
      {
        key: 'fresh',
        name: 'Fresh',
        category: 'secondary' as const,
        awards: [payout(2, { timing: 'end-of-turn', playerTurn: 'either' })],
      },
    ]
    expect(cardsDueFromTheirTurn(1, cards, [])).toEqual([])
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

describe('what a turn opens with', () => {
  it('deals the hand when their turn owed nothing', () => {
    expect(turnPrompt(0, true)).toBe('draw')
  })

  it('settles what their turn owed before dealing anything over it', () => {
    expect(turnPrompt(1, true)).toBe('owed')
  })

  it('opens with nothing when neither is waiting', () => {
    expect(turnPrompt(0, false)).toBeNull()
  })
})

describe('capRoom', () => {
  it('leaves a category alone when the mission states no ceiling', () => {
    expect(capRoom({ round: null, game: null }, { round: 4, game: 20 })).toBeNull()
  })

  it('reports the round ceiling and what is left of it', () => {
    expect(capRoom({ round: 15, game: 50 }, { round: 4, game: 20 })).toEqual({ scope: 'round', cap: 15, room: 11 })
  })

  it('reports the battle ceiling when that is the tighter one', () => {
    expect(capRoom({ round: 15, game: 50 }, { round: 0, game: 45 })).toEqual({ scope: 'battle', cap: 50, room: 5 })
  })

  it('names the round when both are equally tight, since that one comes back next round', () => {
    expect(capRoom({ round: 15, game: 50 }, { round: 10, game: 45 })).toEqual({ scope: 'round', cap: 15, room: 5 })
  })

  it('never reports negative room for a ceiling already passed', () => {
    expect(capRoom({ round: 15, game: null }, { round: 18, game: 0 })).toEqual({ scope: 'round', cap: 15, room: 0 })
  })
})

describe('settleAgainstCaps', () => {
  type Card = { key: string; category: 'primary' | 'secondary' }
  const primary: Card = { key: 'p', category: 'primary' }
  const first: Card = { key: 'a', category: 'secondary' }
  const second: Card = { key: 'b', category: 'secondary' }

  it('banks everything claimed when there is room for it', () => {
    expect(settleAgainstCaps([{ card: primary, claimed: 10 }], { primary: 15, secondary: 15 })).toEqual([
      { card: primary, claimed: 10, scoring: 10 },
    ])
  })

  it('claims what the board paid but only banks what fits', () => {
    expect(settleAgainstCaps([{ card: primary, claimed: 13 }], { primary: 11, secondary: 15 })).toEqual([
      { card: primary, claimed: 13, scoring: 11 },
    ])
  })

  it('draws both cards of a category from the one shared pool', () => {
    expect(
      settleAgainstCaps(
        [
          { card: first, claimed: 8 },
          { card: second, claimed: 8 },
        ],
        { primary: 15, secondary: 10 },
      ),
    ).toEqual([
      { card: first, claimed: 8, scoring: 8 },
      { card: second, claimed: 8, scoring: 2 },
    ])
  })

  it('keeps one category out of the other’s pool', () => {
    expect(
      settleAgainstCaps(
        [
          { card: primary, claimed: 5 },
          { card: first, claimed: 5 },
        ],
        { primary: 0, secondary: 15 },
      ),
    ).toEqual([
      { card: primary, claimed: 5, scoring: 0 },
      { card: first, claimed: 5, scoring: 5 },
    ])
  })
})

describe('the ceiling an allowance reports', () => {
  it('names the battle when a full round allowance is not the thing refusing more', () => {
    expect(capRoom({ round: 15, game: 45 }, { round: 0, game: 44 })).toEqual({ scope: 'battle', cap: 45, room: 1 })
  })
})
