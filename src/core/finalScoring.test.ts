import { expect, it } from 'vitest'
import { type Command, commandRefusal, reduceBattle, scoringDue } from './battle'
import { ALICE, BOB, PLAYERS, log, roster } from './battle.fixtures'
import { cardsDueFromTheirTurn, type MissionAward } from './scoring'

const awards: MissionAward[] = [
  {
    vp: 5,
    per: null,
    mode: null,
    max: null,
    group: null,
    cumulative: false,
    criteria: 'Ordinary condition.',
    trigger: { timing: 'end-of-turn', phase: null, playerTurn: 'your-turn', roundMin: null, roundMax: null },
  },
  {
    vp: 10,
    per: null,
    mode: null,
    max: null,
    group: null,
    cumulative: false,
    criteria: 'Final condition.',
    trigger: { timing: 'end-of-battle', phase: null, playerTurn: null, roundMin: null, roundMax: null },
  },
]
const prep = {
  kind: 'set-prep' as const,
  stratagems: [],
  secondaries: [],
  primary: { key: 'primary', name: 'Mission', awards },
  secondaryMode: 'fixed' as const,
}
const history = (phases: number) => {
  const phasesPlayed: [string, Command][] = []
  for (let index = 0; index < phases; index += 1) {
    const player = Math.floor(index / 6) % 2 ? BOB : ALICE
    if (index > 0 && index % 6 === 0) phasesPlayed.push([player, { kind: 'settle-opponent-turn' }])
    phasesPlayed.push([player, { kind: 'advance' }])
  }
  return log(
    [ALICE, roster('First')],
    [BOB, roster('Second')],
    [ALICE, prep],
    [BOB, prep],
    [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    ...phasesPlayed,
  )
}
const finalScore: Command = {
  kind: 'score-settlement',
  playerId: BOB,
  scores: [{ category: 'primary', delta: 10, final: { claims: [0, 1], delta: 10 } }],
}

it('does not offer final awards when the first side ends its fifth turn', () => {
  const state = reduceBattle(PLAYERS, history(53))
  expect(scoringDue(state, state.players[0]!).flatMap((card) => card.awards.map((award) => award.trigger.timing))).toEqual(['end-of-turn'])
})

it('offers final awards alongside the second side final turn', () => {
  const state = reduceBattle(PLAYERS, history(59))
  expect(scoringDue(state, state.players[1]!).flatMap((card) => card.awards.map((award) => award.trigger.timing))).toEqual([
    'end-of-turn',
    'end-of-battle',
  ])
})

it('refuses a final award before both final turns have ended', () => {
  expect(commandRefusal(reduceBattle(PLAYERS, history(53)), ALICE, { ...finalScore, playerId: ALICE })?.code).toBe('invalid-settlement')
})

it('accepts a final award for the second side at its final end phase', () => {
  expect(commandRefusal(reduceBattle(PLAYERS, history(59)), ALICE, finalScore)).toBeNull()
})

it.each([
  { claims: [1, 0], delta: 5 },
  { claims: [0, 2], delta: 10 },
  { claims: [0, 1], delta: 11 },
  { claims: [0, 1, 1], delta: 10 },
  { claims: [0, -1], delta: 10 },
  { claims: [0, 0], delta: 10 },
  { claims: [0, 1.5], delta: 10 },
  { claims: [0, 101], delta: 10 },
])('refuses an unsupported final claim %j', (final) => {
  expect(
    commandRefusal(reduceBattle(PLAYERS, history(59)), ALICE, { ...finalScore, scores: [{ category: 'primary', delta: 11, final }] })?.code,
  ).toBe('invalid-settlement')
})

it('refuses a final portion larger than the primary entry', () => {
  expect(
    commandRefusal(reduceBattle(PLAYERS, history(59)), ALICE, {
      ...finalScore,
      scores: [{ category: 'primary', delta: 5, final: { claims: [0, 1], delta: 10 } }],
    })?.code,
  ).toBe('invalid-settlement')
})

it('does not treat an outstanding prior-turn settlement as final scoring', () => {
  const before = history(54)
  const skipped = Array.from({ length: 5 }, (_, index) => ({
    seq: before.length + index + 1,
    by: ALICE,
    at: 100 + index,
    command: { kind: 'advance' } as const,
  }))
  const state = reduceBattle(PLAYERS, [...before, ...skipped])
  expect(commandRefusal(state, ALICE, finalScore)?.code).toBe('invalid-settlement')
})

it('permits a supported counted final claim only up to its source ceiling', () => {
  const state = reduceBattle(PLAYERS, history(59))
  state.players[1]!.primaryCard!.awards = [{ ...awards[1]!, vp: 2, per: 'each', max: 5 }]
  expect(
    commandRefusal(state, ALICE, { ...finalScore, scores: [{ category: 'primary', delta: 5, final: { claims: [3], delta: 5 } }] }),
  ).toBeNull()
})

it('refuses an amount beyond a counted final award source ceiling', () => {
  const state = reduceBattle(PLAYERS, history(59))
  state.players[1]!.primaryCard!.awards = [{ ...awards[1]!, vp: 2, per: 'each', max: 5 }]
  expect(
    commandRefusal(state, ALICE, { ...finalScore, scores: [{ category: 'primary', delta: 6, final: { claims: [3], delta: 6 } }] })?.code,
  ).toBe('invalid-settlement')
})

it('refuses two alternatives in the same final payout group', () => {
  const state = reduceBattle(PLAYERS, history(59))
  state.players[1]!.primaryCard!.awards = [
    { ...awards[1]!, group: 'tier' },
    { ...awards[1]!, vp: 5, group: 'tier' },
  ]
  expect(
    commandRefusal(state, ALICE, { ...finalScore, scores: [{ category: 'primary', delta: 15, final: { claims: [1, 1], delta: 15 } }] })
      ?.code,
  ).toBe('invalid-settlement')
})

it('refuses a second final award after recording the first', () => {
  const before = history(59)
  const state = reduceBattle(PLAYERS, [...before, { seq: before.length + 1, by: ALICE, at: 100, command: finalScore }])
  expect(commandRefusal(state, ALICE, finalScore)?.code).toBe('invalid-settlement')
})

it('reopens final scoring when its atomic settlement is undone', () => {
  const before = history(59)
  const state = reduceBattle(PLAYERS, [
    ...before,
    { seq: before.length + 1, by: ALICE, at: 100, command: finalScore },
    { seq: before.length + 2, by: ALICE, at: 101, command: { kind: 'undo', target: before.length + 1 } },
  ])
  expect(commandRefusal(state, ALICE, finalScore)).toBeNull()
})

it('offers only final primary awards during the first side outstanding final settlement', () => {
  const state = reduceBattle(PLAYERS, history(60))
  expect(
    cardsDueFromTheirTurn(5, 5, [{ ...prep.primary, category: 'primary' }], [], true).flatMap((card) =>
      card.awards.map((award) => award.trigger.timing),
    ),
  ).toEqual(['end-of-battle'])
  expect(state.pendingSettlement).toEqual({ playerId: ALICE, round: 5 })
})

it('accepts the first side final award after the second side passes', () => {
  expect(commandRefusal(reduceBattle(PLAYERS, history(60)), BOB, { ...finalScore, playerId: ALICE })).toBeNull()
})

it('refuses the second side award during the first side final settlement', () => {
  expect(commandRefusal(reduceBattle(PLAYERS, history(60)), BOB, finalScore)?.code).toBe('invalid-settlement')
})

it.each([
  { ...awards[1]!, mode: 'tactical' },
  { ...awards[1]!, trigger: { ...awards[1]!.trigger, roundMax: 4 } },
  { ...awards[1]!, trigger: { ...awards[1]!.trigger, roundMin: 6 } },
  { ...awards[1]!, trigger: { ...awards[1]!.trigger, playerTurn: 'opponent-turn' } },
])('refuses a final claim outside its exact eligibility %j', (award) => {
  const state = reduceBattle(PLAYERS, history(59))
  state.players[1]!.primaryCard!.awards = [awards[0]!, award]
  expect(commandRefusal(state, ALICE, finalScore)?.code).toBe('invalid-settlement')
})

it('completes the battle when the final side chooses zero without creating a score', () => {
  const before = history(60)
  const state = reduceBattle(PLAYERS, [...before, { seq: before.length + 1, by: BOB, at: 100, command: { kind: 'settle-opponent-turn' } }])
  expect(state.status).toBe('finished')
})

it('retains historical unmarked score totals and attribution', () => {
  const before = history(59)
  const state = reduceBattle(PLAYERS, [
    ...before,
    { seq: before.length + 1, by: BOB, at: 100, command: { kind: 'score-settlement', scores: [{ category: 'primary', delta: 10 }] } },
  ])
  expect([state.players[1]!.primary, state.players[1]!.primaryByRound[4], state.players[1]!.finalPrimary]).toEqual([10, 10, 0])
})
