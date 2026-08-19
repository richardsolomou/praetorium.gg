import { describe, expect, it } from 'vitest'
import { type AwardTrigger, cardsDue, dueNow, momentsPassed } from './scoring'

const ANY: AwardTrigger = { timing: null, phase: null, playerTurn: null, roundMin: null, roundMax: null }
const trigger = (overrides: Partial<AwardTrigger>): AwardTrigger => ({ ...ANY, ...overrides })
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
        awards: [{ vp: 3, per: null, mode: null, when: null, trigger: trigger({ timing: 'end-of-turn' }) }],
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
        awards: [
          { vp: 2, per: null, mode: null, when: null, trigger: trigger({ timing: 'end-of-turn' }) },
          { vp: 3, per: null, mode: null, when: null, trigger: trigger({ timing: 'end-of-phase', phase: 'command' }) },
        ],
      },
    ]
    expect(cardsDue(at('command'), true, cards)[0]?.awards.map((award) => award.vp)).toEqual([3])
  })
})
