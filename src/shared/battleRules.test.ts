import { expect, it } from 'vitest'
import { type Command, reduceBattle } from '../core/battle'
import { ALICE, BOB, PLAYERS, builtRoster, log } from '../core/battle.fixtures'
import type { MissionAward } from '../core/scoring'
import { hydrateAuthoritativeAwards, scoringCapError, withAuthoritativeAwards } from './battleRules'
import type { LoadedRules } from './rules'

const award: MissionAward = {
  vp: 10,
  per: null,
  max: null,
  mode: null,
  group: null,
  cumulative: false,
  criteria: 'Final condition.',
  trigger: { timing: 'end-of-battle', phase: null, playerTurn: null, roundMin: null, roundMax: null },
}
const rules = {
  missions: new Map([
    [
      'reconnaissance|reconnaissance',
      {
        id: 'mission',
        name: 'Mission',
        roundCap: 15,
        gameCap: 45,
        secondaryRoundCap: 15,
        secondaryGameCap: 45,
        source: 'Test',
        packId: null,
        deploymentIds: [],
      },
    ],
  ]),
  fixedSecondaryCaps: new Map<string, number>(),
}
const state = () => {
  const value = reduceBattle(
    PLAYERS,
    log([ALICE, builtRoster('First', [])], [BOB, builtRoster('Second', [])], [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }]),
  )
  value.round = 5
  value.phase = 'end'
  value.activePlayerId = BOB
  value.players[1]!.primaryCard = { key: 'mission', name: 'Mission', awards: [award] }
  value.players[1]!.primary = 15
  value.players[1]!.primaryByRound[4] = 15
  return value
}
const finalScore: Command = {
  kind: 'score-settlement',
  playerId: BOB,
  scores: [{ category: 'primary', delta: 10, final: { claims: [1], delta: 10 } }],
}

it('exempts a validated final award from the round ceiling', () => {
  expect(scoringCapError(state(), ALICE, finalScore, rules)).toBeNull()
})

it('retains the whole-battle ceiling on final awards', () => {
  const value = state()
  value.players[1]!.primary = 40
  expect(scoringCapError(value, ALICE, finalScore, rules)?.code).toBe('score-cap-battle')
})

it('caps the ordinary portion of a combined settlement', () => {
  expect(
    scoringCapError(
      state(),
      ALICE,
      { ...finalScore, scores: [{ category: 'primary', delta: 15, final: { claims: [1], delta: 10 } }] },
      rules,
    )?.code,
  ).toBe('score-cap-round')
})

it('refuses a caller-supplied final exemption before both final turns end', () => {
  const value = state()
  value.activePlayerId = ALICE
  expect(scoringCapError(value, ALICE, finalScore, rules)?.code).toBe('invalid-settlement')
})

it('does not count banked final awards toward later ordinary corrections', () => {
  const value = state()
  value.players[1]!.primary = 25
  value.players[1]!.primaryByRound[4] = 25
  value.players[1]!.finalPrimary = 10
  expect(scoringCapError(value, ALICE, { kind: 'score', playerId: BOB, category: 'primary', delta: 1 }, rules)?.code).toBe(
    'score-cap-round',
  )
})

it('does not subtract later final awards from an earlier round settlement', () => {
  const value = state()
  value.players[1]!.finalPrimary = 10
  value.players[1]!.primaryByRound[0] = 15
  expect(
    scoringCapError(value, ALICE, { kind: 'score-settlement', playerId: BOB, round: 1, scores: [{ category: 'primary', delta: 1 }] }, rules)
      ?.code,
  ).toBe('score-cap-round')
})

it('caps a missed score against the round it belongs to', () => {
  const value = state()
  value.players[1]!.primaryByRound[3] = 15
  expect(
    scoringCapError(
      value,
      ALICE,
      {
        kind: 'score-settlement',
        playerId: BOB,
        scores: [{ category: 'primary', delta: 1 }],
        missed: { round: 4, phase: 'end', turn: BOB },
      },
      rules,
    )?.message,
  ).toBe('that would score past battle round 4’s 15 VP cap for primary mission')
})

it('does not cap a missed score by the round being played', () => {
  expect(
    scoringCapError(
      state(),
      ALICE,
      {
        kind: 'score-settlement',
        playerId: BOB,
        scores: [{ category: 'primary', delta: 1 }],
        missed: { round: 4, phase: 'end', turn: BOB },
      },
      rules,
    ),
  ).toBeNull()
})

const selectionRules = {
  ...rules,
  missions: new Map(),
  primaries: [{ key: 'mission', name: 'Verified mission', awards: [award], selection: 'punishment' }],
  secondaries: [],
} as unknown as LoadedRules
const prepared = { primary: { key: 'mission', name: 'Caller name', selection: 'beacon' as const }, secondaries: [], secondaryDeck: [] }

it('takes nomination capability from the authoritative card rather than the caller', () => {
  expect(withAuthoritativeAwards(prepared, selectionRules).primary).toEqual({
    key: 'mission',
    name: 'Verified mission',
    awards: [award],
    selection: 'punishment',
  })
})

it('strips invented nomination metadata from an unknown card', () => {
  expect(withAuthoritativeAwards({ ...prepared, primary: { ...prepared.primary, key: 'invented' } }, selectionRules).primary).toEqual({
    key: 'invented',
    name: 'Caller name',
  })
})

it('does not opt an old battle into new compulsory choices during in-play preparation repair', () => {
  const battle = state()
  expect(withAuthoritativeAwards(prepared, selectionRules, battle.players[1]).primary?.selection).toBeUndefined()
})

it('preserves already frozen nomination capability during in-play preparation repair', () => {
  const battle = state()
  battle.players[1]!.primaryCard!.selection = 'punishment'
  expect(withAuthoritativeAwards(prepared, selectionRules, battle.players[1]).primary?.selection).toBe('punishment')
})

it('hydrates old awards without silently adding selection capability', () => {
  const battle = state()
  battle.players[1]!.primaryCard = { key: 'mission', name: 'Old mission' }
  hydrateAuthoritativeAwards(battle, selectionRules)
  expect(battle.players[1]!.primaryCard).toEqual({ key: 'mission', name: 'Verified mission', awards: [award], selection: undefined })
})
