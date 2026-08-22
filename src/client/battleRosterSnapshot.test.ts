import { describe, expect, it } from 'vitest'
import type { BattleView } from '../core/battleView'
import { fieldedRoster } from './battleRosterSnapshot'

describe('fielded roster snapshots', () => {
  it('reads the roster embedded in the battle view', () => {
    const snapshot = { id: 'roster', name: 'Fielded name', text: 'Fielded units' }
    const view = { players: [{ roster: snapshot }] } as BattleView

    expect(fieldedRoster(view, 'roster')).toBe(snapshot)
    expect(fieldedRoster(view, 'another-roster')).toBeNull()
  })
})
