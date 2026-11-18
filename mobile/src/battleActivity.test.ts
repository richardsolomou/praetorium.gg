import { describe, expect, it } from 'vitest'
import type { WatchBattle } from '../../src/contracts/watchBattle'
import { battleActivity, battleNotificationText } from './battleActivity'

const snapshot: WatchBattle = {
  version: 1,
  battleId: 'abc',
  viewerId: 'viewer',
  seq: 12,
  updatedAt: 1_000_000,
  status: 'playing',
  round: 2,
  rounds: 5,
  phase: 'shooting',
  activeSide: 0,
  paused: false,
  turnElapsedMs: 90_000,
  turnRunning: true,
  sides: [
    { index: 0, name: 'Ultramarines', yours: true, vp: 25, cp: 3 },
    { index: 1, name: 'Necrons', yours: false, vp: 18, cp: 1 },
  ],
  objectives: [],
  reminders: [],
  moreReminders: 0,
}

describe('battleActivity', () => {
  it('shows nothing for a battle watched from the stands', () => {
    expect(battleActivity({ ...snapshot, sides: snapshot.sides.map((side) => ({ ...side, yours: false })) })).toBeNull()
  })

  it('starts the turn clock where it would have read zero', () => {
    expect(battleActivity(snapshot)?.state.turnStartedAt).toBe(910_000)
  })

  it('leaves a stopped turn clock still', () => {
    expect(battleActivity({ ...snapshot, turnRunning: false })?.state.turnStartedAt).toBeNull()
  })

  it('shortens a long name to what ActivityKit accepts', () => {
    const named = battleActivity({ ...snapshot, sides: [{ ...snapshot.sides[0]!, name: 'x'.repeat(160) }] })
    expect(named!.state.sides[0]!.name).toHaveLength(40)
  })
})

describe('battleNotificationText', () => {
  it('names the round, phase and whose turn it is', () => {
    expect(battleNotificationText(battleActivity(snapshot)!).title).toBe('Round 2 · Shooting · Your turn')
  })
})
