import { describe, expect, it } from 'vitest'
import { compactReplayFrames, expandReplayFrames } from './replayFrames'

describe('replay frame changes', () => {
  it('reconstructs changed fields, growing reports, and undo frames', () => {
    const frames = [
      { view: { round: 1, players: [{ score: 0 }, { score: 0 }], hidden: { mission: 'alpha' } }, report: [{ seq: 1 }] },
      { view: { round: 1, players: [{ score: 5 }, { score: 0 }], hidden: { mission: 'alpha' } }, report: [{ seq: 1 }, { seq: 2 }] },
      { view: { round: 1, players: [{ score: 0 }, { score: 0 }] }, report: [{ seq: 1 }, { seq: 2 }, { seq: 3 }] },
    ]
    const compact = compactReplayFrames(frames)
    expect(expandReplayFrames(compact.first, compact.deltas)).toEqual(frames)
  })

  it('reconstructs shrinking arrays and replaced values', () => {
    const frames = [
      { missions: ['a', 'b'], selected: null },
      { missions: ['c'], selected: { id: 1 } },
    ]
    const compact = compactReplayFrames(frames)
    expect(expandReplayFrames(compact.first, compact.deltas)).toEqual(frames)
  })

  it('keeps prior frames intact when later changes are applied', () => {
    const compact = compactReplayFrames([{ report: [1] }, { report: [1, 2] }])
    expect(expandReplayFrames(compact.first, compact.deltas)[0]).toEqual({ report: [1] })
  })
})
