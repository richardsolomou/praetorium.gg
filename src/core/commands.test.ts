import { describe, expect, it } from 'vitest'
import { FIXED_SECONDARIES, SECONDARIES_MAX, SETUP_STEP_MAX } from './battle'
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
          detachmentIds: ['awakened-dynasty'],
          picks: [{ entryId: 'overlord', choices: { weapon: 'blade' } }],
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
    // Bound by the constant rather than a number, so adding a section moves both together.
    expect(commandSchema.safeParse({ kind: 'set-setup-step', step: SETUP_STEP_MAX }).success).toBe(true)
    expect(commandSchema.safeParse({ kind: 'set-setup-step', step: SETUP_STEP_MAX + 1 }).success).toBe(false)
  })

  it('accepts a player target on a live action', () => {
    expect(commandSchema.parse({ kind: 'advance', playerId: 'alice' })).toEqual({ kind: 'advance', playerId: 'alice' })
  })

  it('accepts settling the previous turn', () => {
    expect(commandSchema.parse({ kind: 'settle-opponent-turn' })).toEqual({ kind: 'settle-opponent-turn' })
  })

  it('accepts resolving a tactical hand with or without its CP choice', () => {
    expect(commandSchema.parse({ kind: 'resolve-tactical-hand' })).toEqual({ kind: 'resolve-tactical-hand' })
    expect(commandSchema.parse({ kind: 'resolve-tactical-hand', keys: ['beacon'], gainCp: true, playerId: 'alice' })).toEqual({
      kind: 'resolve-tactical-hand',
      keys: ['beacon'],
      gainCp: true,
      playerId: 'alice',
    })
  })

  it('only lets scoring settlements complete a secondary', () => {
    expect(
      commandSchema.safeParse({
        kind: 'score-settlement',
        scores: [{ category: 'secondary', key: 'beacon', delta: 4, status: 'discarded' }],
      }).success,
    ).toBe(false)
  })
})

describe('the round a settlement names', () => {
  const settlement = (round?: number) => ({
    kind: 'score-settlement' as const,
    scores: [{ category: 'primary' as const, delta: 3 }],
    ...(round === undefined ? {} : { round }),
  })

  it('carries a named battle round across the wire', () => {
    expect(commandSchema.parse(settlement(1))).toMatchObject({ round: 1 })
  })

  it('leaves a settlement that names none without one', () => {
    expect(commandSchema.parse(settlement())).not.toHaveProperty('round')
  })

  it('refuses a round outside the battle', () => {
    expect(commandSchema.safeParse(settlement(0)).success).toBe(false)
    expect(commandSchema.safeParse(settlement(6)).success).toBe(false)
  })

  /**
   * The schema parses stored logs, so it bounds what was ever written — not what the
   * rule allows today. Tightening it to the rule refuses to read battles that were
   * settled under the old one, which is a data-compatibility break, not a fix.
   */
  it('still reads a hand settled when more fixed secondaries were allowed', () => {
    const card = (key: string) => ({ key, name: key })
    const prep = {
      stratagems: [],
      secondaries: Array.from({ length: SECONDARIES_MAX }, (_, at) => card(`card-${at}`)),
      primary: null,
      secondaryMode: 'fixed' as const,
    }

    expect(SECONDARIES_MAX).toBeGreaterThan(FIXED_SECONDARIES)
    expect(commandSchema.safeParse({ kind: 'set-prep', ...prep }).success).toBe(true)
  })
})
