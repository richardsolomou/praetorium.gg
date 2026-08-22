import { describe, expect, it } from 'vitest'
import { commandSchema } from './commands'

describe('command schema', () => {
  it('keeps frozen roster-card details on an attached roster', () => {
    const command = {
      kind: 'attach-roster' as const,
      roster: {
        name: 'Awakened Dynasty',
        text: 'Overlord — 85',
        built: {
          catalogueId: 'necrons',
          revision: 'revision',
          limit: 2_000,
          detachment: 'Awakened Dynasty',
          disposition: 'reconnaissance',
          units: [
            {
              key: '0-overlord',
              entryId: 'overlord',
              name: 'Overlord',
              points: 85,
              models: 1,
              group: 'character' as const,
              wargear: [{ name: "Overlord's blade", count: 1 }],
              enhancements: ['Veil of Darkness'],
              upgrades: [],
              joined: [{ label: 'Leading', name: 'Immortals' }],
            },
          ],
        },
      },
    }

    expect(commandSchema.parse(command)).toEqual(command)
  })

  it('keeps legacy attached rosters without card details readable', () => {
    const command = {
      kind: 'attach-roster' as const,
      roster: {
        name: 'Legacy list',
        text: '5 Immortals',
        built: {
          catalogueId: 'necrons',
          revision: 'revision',
          limit: 2_000,
          detachment: 'Awakened Dynasty',
          disposition: null,
          units: [{ key: '0-immortals', name: 'Immortals', points: 100, models: 5 }],
        },
      },
    }

    expect(commandSchema.parse(command)).toEqual(command)
  })

  it('accepts a shared setup section', () => {
    expect(commandSchema.parse({ kind: 'set-setup-step', step: 3 })).toEqual({ kind: 'set-setup-step', step: 3 })
  })

  it('rejects a setup section outside the wizard', () => {
    expect(commandSchema.safeParse({ kind: 'set-setup-step', step: 6 }).success).toBe(false)
  })

  it('accepts a player target on a live action', () => {
    expect(commandSchema.parse({ kind: 'advance', playerId: 'alice' })).toEqual({ kind: 'advance', playerId: 'alice' })
  })

  it('accepts settling the previous turn', () => {
    expect(commandSchema.parse({ kind: 'settle-opponent-turn' })).toEqual({ kind: 'settle-opponent-turn' })
  })
})
