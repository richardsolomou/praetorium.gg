import { expect, it } from 'vitest'
import { ALICE, BOB, log, started } from './battle.fixtures'
import { appendLocalCommand, localBattleState, resolveLocalDraw, visibleBattleLog } from './offlineBattle'
import type { Command } from './battle'

const players = [
  { id: ALICE, name: 'Alice', side: 0, automated: false },
  { id: BOB, name: 'Bob', side: 1, automated: false },
]

it('strips personal roster reminders from another player’s downloaded log', () => {
  const history = log([
    ALICE,
    {
      kind: 'attach-roster',
      roster: { name: 'Army', text: 'Units', reminders: [{ id: 'personal', text: 'Private note', timings: [] }] },
    } as unknown as Command,
  ])
  expect(JSON.stringify(visibleBattleLog(players, history, BOB))).not.toContain('Private note')
})
it('strips unit notes but keeps nicknames in another player’s downloaded log', () => {
  const history = log([
    ALICE,
    {
      kind: 'attach-roster',
      roster: {
        name: 'Army',
        text: 'Units',
        built: {
          catalogueId: 'cat',
          revision: 'rev',
          limit: 2000,
          detachment: null,
          disposition: null,
          picks: [{ entryId: 'intercessors', nickname: 'Alpha', note: 'Private plan' }],
          units: [{ key: 'u0', name: 'Intercessors', nickname: 'Alpha', note: 'Private plan', points: 80, models: 5 }],
        },
      },
    },
  ])
  const downloaded = JSON.stringify(visibleBattleLog(players, history, BOB))
  expect([downloaded.includes('Private plan'), downloaded.includes('Alpha')]).toEqual([false, true])
})
it('records local commands with nondecreasing timestamps and derives their undo', () => {
  const history = log(...started())
  const scored = appendLocalCommand(players, history, ALICE, { kind: 'score', category: 'primary', delta: 5 }, 1)
  const undone = appendLocalCommand(players, scored, ALICE, { kind: 'undo', target: 4 }, 0)
  expect({ points: localBattleState(players, undone).players[0]?.primary, timestamps: undone.slice(3).map((entry) => entry.at) }).toEqual({
    points: 0,
    timestamps: [2, 2],
  })
})

it('refuses offline scoring before the battle starts', () => {
  expect(() => appendLocalCommand(players, [], ALICE, { kind: 'score', category: 'primary', delta: 5 }, 100)).toThrow(
    'the battle is not running',
  )
})

it('refuses an offline command from a player without a seat', () => {
  expect(() => appendLocalCommand(players, log(...started()), 'outsider', { kind: 'score', category: 'primary', delta: 5 }, 100)).toThrow(
    'you are not in this battle',
  )
})
it('retains the selected random card in the recorded command', () => {
  const cards = [
    { key: 'one', name: 'One' },
    { key: 'two', name: 'Two' },
  ]
  const history = log(...started(), [
    ALICE,
    { kind: 'set-prep', stratagems: [], primary: null, secondaries: [], secondaryMode: 'tactical', secondaryDeck: cards },
  ])
  expect(resolveLocalDraw(players, history, ALICE, { kind: 'draw-secondary', secondary: cards[0]! }, () => 1)).toEqual({
    kind: 'draw-secondary',
    secondary: cards[1],
  })
})
