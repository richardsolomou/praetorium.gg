import { describe, expect, it } from 'vitest'
import { type Command } from './battle'
import { battleReport } from './battleReport'
import { ALICE, BOB, CAROL, NAMES, builtRoster, log, roster, started, turns, text } from './battle.fixtures'

describe('the account of the battle', () => {
  it('says who brought what', () => {
    expect(text(battleReport(NAMES, log(...started())))[0]).toBe('Alice brought Ultramarines')
  })

  it('names the detachment when the list does not', () => {
    const history = log([ALICE, builtRoster('Ultramarines', ['Intercessors'])])
    expect(text(battleReport(NAMES, history))[0]).toBe('Alice brought Ultramarines (Flyblown Host)')
  })

  it('names a battlefield by its deployment rather than its terrain source id', () => {
    const history = log([ALICE, { kind: 'set-battlefield', patternId: 'search-and-destroy', terrainLayoutId: 'bm-take-vs-recon-03' }])

    expect(
      text(
        battleReport(NAMES, history, undefined, undefined, undefined, {
          deployments: [{ id: 'search-and-destroy', name: 'Search and Destroy' }],
        }),
      ),
    ).toContain('The battlefield is Search and Destroy')
  })

  it('marks the turn passing over', () => {
    const history = log(...started(), ...turns(6, ALICE))
    expect(text(battleReport(NAMES, history))).toContain('The turn passes to Bob; both sides gain 1 CP')
  })

  it('reports the command points granted with the first turn', () => {
    expect(text(battleReport(NAMES, log(...started())))).toContain(
      'The battle begins, Alice attacking and Alice taking the first turn; both sides gain 1 CP',
    )
  })

  it('marks a new round', () => {
    const history = log(...started(), ...turns(6, ALICE), ...turns(6, BOB))
    expect(text(battleReport(NAMES, history))).toContain('Round 2 begins; both sides gain 1 CP')
  })

  it('marks the last round before final opponent-turn scoring is settled', () => {
    const rounds = Array.from({ length: 5 }, () => [...turns(6, ALICE), ...turns(6, BOB)]).flat()

    expect(text(battleReport(NAMES, log(...started(), ...rounds))).at(-1)).toBe('The last round ends')
  })

  it('reports a stratagem by name and cost', () => {
    const history = log(
      ...started(),
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [{ key: 's1', name: 'Grenade', cp: 1, limit: 'turn' }],
          secondaries: [],
          primary: null,
          secondaryMode: 'fixed',
        },
      ],
      [ALICE, { kind: 'adjust-cp', delta: 2 }],
      [ALICE, { kind: 'use-stratagem', key: 's1' }],
    )
    expect(text(battleReport(NAMES, history))).toContain('Alice uses Grenade for 1 CP')
  })

  it('reports the mission replaced with New Orders', () => {
    const history = log(
      ...started(),
      [
        ALICE,
        {
          kind: 'set-prep',
          stratagems: [{ key: 'new-orders', name: 'New Orders', cp: 1, limit: 'phase', phases: ['command'], turn: 'your-turn' }],
          secondaries: [],
          secondaryDeck: [
            { key: 'a', name: 'Behind Enemy Lines' },
            { key: 'b', name: 'Area Denial' },
          ],
          primary: null,
          secondaryMode: 'tactical',
        },
      ],
      [ALICE, { kind: 'draw-secondary', secondary: { key: 'a', name: 'Behind Enemy Lines' } }],
      [
        ALICE,
        {
          kind: 'use-new-orders',
          stratagemKey: 'new-orders',
          secondaryKey: 'a',
          secondary: { key: 'b', name: 'Area Denial' },
        },
      ],
    )

    expect(text(battleReport(NAMES, history))).toContain(
      'Alice uses New Orders for 1 CP, discarding Behind Enemy Lines and drawing Area Denial',
    )
  })

  it('names both players when one records an action for another', () => {
    const history = log(...started(), [BOB, { kind: 'adjust-cp', delta: 2, playerId: ALICE }])

    expect(text(battleReport(NAMES, history))).toContain('Bob adds 2 CP for Alice')
  })

  it('uses shared side details when a teammate is named as the target', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const history = log(
      [ALICE, configure],
      [ALICE, roster('Knights')],
      [BOB, roster('Marines')],
      [CAROL, roster('Guard')],
      [
        BOB,
        {
          kind: 'set-prep',
          stratagems: [{ key: 's1', name: 'Grenade', cp: 1, limit: 'turn' }],
          secondaries: [],
          primary: null,
          secondaryMode: 'fixed',
        },
      ],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [BOB, { kind: 'adjust-cp', delta: 1 }],
      [ALICE, { kind: 'use-stratagem', key: 's1', playerId: CAROL }],
    )

    expect(text(battleReport([...NAMES, { id: CAROL, name: 'Carol' }], history, [ALICE, BOB, CAROL], ALICE, [0, 1, 1]))).toContain(
      'Alice uses Carol’s Grenade for 1 CP',
    )
  })

  it('leaves out what was undone, because it did not happen', () => {
    const history = log(...started(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }])
    const withUndo = [...history, { seq: history.length + 1, by: ALICE, at: 9, command: { kind: 'undo' as const, target: history.length } }]
    expect(text(battleReport(NAMES, withUndo))).not.toContain('Alice scores 5 primary')
  })

  it('reports a scoring settlement as one grouped event', () => {
    const history = log(...started(), [
      ALICE,
      {
        kind: 'score-settlement',
        scores: [
          { category: 'primary', delta: 5 },
          { category: 'secondary', key: 'beacon', delta: 4 },
        ],
      },
    ])
    expect(text(battleReport(NAMES, history)).at(-1)).toBe('Alice settles 5 primary VP, 4 VP on a secondary')
  })

  it('records the round a thing happened in', () => {
    const history = log(...started(), ...turns(6, ALICE), ...turns(6, BOB), [BOB, { kind: 'score', category: 'primary', delta: 3 }])
    expect(battleReport(NAMES, history).at(-1)).toMatchObject({ round: 2, text: 'Bob scores 3 primary' })
  })
})
