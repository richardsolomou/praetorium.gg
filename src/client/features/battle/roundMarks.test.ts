import { describe, expect, it } from 'vitest'
import { dueSummary, settledMark } from './roundMarks'

const playing = (round: number, settlementRound: number | null = null) => ({ status: 'playing', round, settlementRound }) as const

describe('settled round', () => {
  it('waits for the second turn of a round to be scored', () => {
    expect(settledMark(playing(3, 2))).toEqual({ round: 1, finished: false })
  })

  it('counts the round once its last turn is scored', () => {
    expect(settledMark(playing(3))).toEqual({ round: 2, finished: false })
  })
})

describe('due summary', () => {
  it('shows nothing the first time a device sees a battle', () => {
    expect(dueSummary(null, { round: 2, finished: false })).toBeNull()
  })

  it('shows a round the device has not shown', () => {
    expect(dueSummary({ round: 1, finished: false }, { round: 2, finished: false })).toEqual({ round: 2, finished: false })
  })

  it('does not show a round again after an undo replays it', () => {
    expect(dueSummary({ round: 2, finished: false }, { round: 2, finished: false })).toBeNull()
  })

  it('shows the end of a battle after its last round', () => {
    expect(dueSummary({ round: 4, finished: false }, { round: 5, finished: true })).toEqual({ round: 5, finished: true })
  })

  it('counts the rounds of a battle reopened after ending early', () => {
    expect(dueSummary({ round: 2, finished: true }, { round: 3, finished: false })).toEqual({ round: 3, finished: false })
  })
})
