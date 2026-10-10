import { expect, it } from 'vitest'
import { ALICE, BOB, log, started, turns } from './battle.fixtures'
import { appendLocalCommand, localBattleState, localBattleView, resolveLocalDraw, visibleBattleLog } from './offlineBattle'
import type { Command } from './battle'

const players = [
  { id: ALICE, name: 'Alice', side: 0, automated: false },
  { id: BOB, name: 'Bob', side: 1, automated: false },
]
const secret = {
  key: 'private-card',
  name: 'Hidden Mission',
  awards: [
    {
      vp: 5,
      per: null,
      mode: null,
      max: null,
      group: null,
      cumulative: false,
      criteria: 'Private source detail',
      trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'your-turn', roundMin: null, roundMax: null },
    },
  ],
}

it('removes an opponent’s secret identity and private deck from the downloaded history', () => {
  const history = log(
    ...started(),
    [ALICE, { kind: 'set-prep', stratagems: [], primary: null, secondaries: [], secondaryMode: 'tactical', secondaryDeck: [secret] }],
    [ALICE, { kind: 'select-secret', secondary: secret }],
  )
  expect(JSON.stringify(visibleBattleLog(players, history, BOB))).not.toMatch(/private-card|Hidden Mission|Private source detail/)
})
it('keeps an undone secret choice private in its downloaded historical command', () => {
  const history = log(...started(), [ALICE, { kind: 'select-secret', secondary: secret }], [ALICE, { kind: 'undo', target: 4 }])
  expect(JSON.stringify(visibleBattleLog(players, history, BOB))).not.toContain('Hidden Mission')
})
it('preserves the owner’s private deck', () => {
  const history = log(...started(), [ALICE, { kind: 'select-secret', secondary: secret }])
  expect(JSON.stringify(visibleBattleLog(players, history, ALICE))).toContain('Hidden Mission')
})
it('keeps later revealed secrets hidden in an earlier replay frame', () => {
  const history = log(...started(), [ALICE, { kind: 'select-secret', secondary: secret }], ...turns(6, ALICE), ...turns(6, BOB), [
    ALICE,
    { kind: 'reveal-secret' },
  ])
  const saved = visibleBattleLog(players, history, BOB)
  expect(localBattleView({ token: 'battle' }, players, saved.slice(0, 4), BOB).players[0]?.secondaries[0]?.name).toBe('Secret mission')
})
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
it('records local commands with nondecreasing timestamps and derives their undo', () => {
  const history = log(...started())
  const scored = appendLocalCommand(players, history, ALICE, { kind: 'score', category: 'primary', delta: 5 }, 1)
  const undone = appendLocalCommand(players, scored, ALICE, { kind: 'undo', target: 4 }, 0)
  expect({ points: localBattleState(players, undone).players[0]?.primary, timestamps: undone.slice(3).map((entry) => entry.at) }).toEqual({
    points: 0,
    timestamps: [2, 2],
  })
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

it('restores opaque secret keys for server validation without changing other card keys', async () => {
  const { restoreOpaqueBattleKeys } = await import('./offlineBattle')
  const history = log(...started(), [ALICE, { kind: 'select-secret', secondary: secret }])
  expect(restoreOpaqueBattleKeys(players, history, { kind: 'score-secondary', key: 'secret-0-4', delta: 5 })).toEqual({
    kind: 'score-secondary',
    key: 'private-card',
    delta: 5,
  })
})

it('keeps the practice side’s remaining deck usable without naming its face-down card', () => {
  const practice = players.map((player) => ({ ...player, automated: player.id === BOB }))
  const remaining = { key: 'public-card', name: 'Public Mission' }
  const history = log(
    ...started(),
    [
      BOB,
      { kind: 'set-prep', stratagems: [], primary: null, secondaries: [], secondaryMode: 'tactical', secondaryDeck: [secret, remaining] },
    ],
    [BOB, { kind: 'select-secret', secondary: secret }],
  )
  const saved = visibleBattleLog(practice, history, ALICE)
  expect(localBattleView({ token: 'battle' }, practice, saved, ALICE).players[1]?.remainingSecondaries).toEqual([remaining])
})
it('preserves a teammate’s private deck for the shared side', () => {
  const team = players.map((player) => ({ ...player, side: 0 }))
  const history = log(
    [BOB, { kind: 'set-prep', stratagems: [], primary: null, secondaries: [], secondaryMode: 'tactical', secondaryDeck: [secret] }],
    [BOB, { kind: 'select-secret', secondary: secret }],
  )
  expect(JSON.stringify(visibleBattleLog(team, history, ALICE))).toContain('Hidden Mission')
})
