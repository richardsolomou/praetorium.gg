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

  it('marks the turn passing over', () => {
    const history = log(...started(), ...turns(6, ALICE))
    expect(text(battleReport(NAMES, history))).toContain('The turn passes to Bob, who gains 1 CP')
  })

  it('reports the command point granted with the first turn', () => {
    expect(text(battleReport(NAMES, log(...started())))).toContain(
      'The battle begins, Alice attacking and Alice taking the first turn and gaining 1 CP',
    )
  })

  it('marks a new round', () => {
    const history = log(...started(), ...turns(6, ALICE), ...turns(6, BOB))
    expect(text(battleReport(NAMES, history))).toContain('Round 2 begins; Alice gains 1 CP')
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
