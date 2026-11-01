import { describe, expect, it } from 'vitest'
import type { Phase } from '../../../core/battle'
import { passedMoments, type SeenMoment } from './reminderMoments'

const yours = (phase: Phase): SeenMoment => ({ round: 2, activePlayerId: 'player:one', phase, turn: 'your-turn', order: 2 })
const theirs = (phase: Phase): SeenMoment => ({ round: 2, activePlayerId: 'player:two', phase, turn: 'opponent-turn', order: 3 })
const later = (phase: Phase): SeenMoment => ({ round: 3, activePlayerId: 'player:one', phase, turn: 'your-turn', order: 4 })
const phases = (moments: SeenMoment[]) => moments.map((moment) => `${moment.turn} ${moment.phase}`)

describe('passed moments', () => {
  it('passes every phase skipped within a turn', () => {
    expect(phases(passedMoments(yours('command'), yours('shooting')))).toEqual(['your-turn command', 'your-turn movement'])
  })

  it('passes the rest of the previous turn and this turn up to now', () => {
    expect(phases(passedMoments(yours('charge'), theirs('movement')))).toEqual([
      'your-turn charge',
      'your-turn fight',
      'your-turn end',
      'opponent-turn command',
    ])
  })

  it('passes only this turn after more than one turn away', () => {
    expect(phases(passedMoments(yours('movement'), later('movement')))).toEqual(['your-turn command'])
  })

  it('passes nothing when a phase is undone', () => {
    expect(passedMoments(theirs('shooting'), theirs('movement'))).toEqual([])
  })

  it('passes nothing when a turn is undone', () => {
    expect(passedMoments(theirs('command'), yours('fight'))).toEqual([])
  })
})
