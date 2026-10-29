import { expect, it } from 'vitest'
import { reduceBattle, sidePaintedPoints } from './battle'
import { battlebaseBattleImport, type BattlebaseBattle } from './battlebaseBattle'
import { concededBattle, CREATOR, IMPORTED_ARMIES, OPPONENT } from './battlebaseBattle.fixtures'

const seats = { battlebaseId: OPPONENT, userId: 'me', guestId: 'guest:battle:0' }
const context = { armies: IMPORTED_ARMIES, pack: null, stratagemNames: ['Command Re-roll', 'Methodical Murder'] }

function imported(battle: BattlebaseBattle = concededBattle(), as = seats) {
  const copy = battlebaseBattleImport(battle, as, context)
  if (typeof copy === 'string') throw new Error(copy)
  return copy
}

function folded(battle?: BattlebaseBattle) {
  const log = imported(battle).commands.map(({ command, at }, index) => ({ seq: index + 1, by: 'me', at, command }))
  return reduceBattle(['me', 'guest:battle:0'], log, [0, 1])
}

it('replays an importer who was BattleBase’s opponent on their own seat, round by round', () => {
  expect(folded().players.map(({ primaryByRound, secondaryByRound, cp }) => ({ primaryByRound, secondaryByRound, cp }))).toEqual([
    { primaryByRound: [0, 0, 0, 0, 0], secondaryByRound: [4, 0, 0, 0, 0], cp: 1 },
    { primaryByRound: [5, 10, 0, 0, 0], secondaryByRound: [0, 3, 0, 0, 0], cp: 2 },
  ])
})

it('plays as a guided battle that pays each painted side the battle ready bonus', () => {
  const state = folded()
  expect([state.settings.manual, sidePaintedPoints(state, 0), sidePaintedPoints(state, 1)]).toEqual([undefined, 10, 10])
})

it('scores a drawn card by name and records it achieved', () => {
  const [me] = folded().players
  expect([me!.secondaries.map((card) => card.name), me!.scored, Object.values(me!.secondaryStatus)]).toEqual([
    ['Assassination'],
    { [me!.secondaries[0]!.key]: 4 },
    ['achieved'],
  ])
})

it('records each stratagem use by name at the cost BattleBase charged', () => {
  expect(folded().players.map((player) => player.uses.map(({ name, cp }) => ({ name, cp })))).toEqual([
    [{ name: 'Methodical Murder', cp: 2 }],
    [{ name: 'Command Re-roll', cp: 1 }],
  ])
})

it('records a stratagem BattleBase let a side use for free', () => {
  const battle = concededBattle()
  const use = battle.eventsJson.find((event) => event.data?.stratagemId === 'stratagem-core-command-re-roll')!
  use.value = 0
  expect(folded(battle).players[1]!.uses.map(({ name, cp }) => ({ name, cp }))).toEqual([{ name: 'Command Re-roll', cp: 0 }])
})

it('names the detachment a stratagem comes from when its id does', () => {
  expect(folded().players[0]!.stratagems[0]!.detachment).toBe('Cursed Legion')
})

it('marks a unit destroyed through the unit the catalogue rebuilt for it', () => {
  expect(folded().players[0]!.units.map((unit) => unit.destroyed)).toEqual([true])
})

it('records the concession against the side BattleBase says conceded', () => {
  expect(folded().result).toEqual({ reason: 'conceded', concededBy: 'me' })
})

it('keeps when each command happened on BattleBase', () => {
  const battle = concededBattle()
  const conceded = battle.eventsJson.find((event) => event.type === 'CONCEDED_BATTLE')!
  expect(imported(battle).commands.at(-1)!.at).toBe(conceded.timestamp)
})

it('ends a game BattleBase finished early without a concession as finished early', () => {
  const battle = concededBattle()
  const conceded = battle.eventsJson.find((event) => event.type === 'CONCEDED_BATTLE')!
  conceded.type = 'FINISHED_GAME'
  conceded.actor = 'Players'
  expect(folded(battle).result).toEqual({ reason: 'finished-early', concededBy: null })
})

it('names the opponent the guest seat stands for', () => {
  expect(imported(concededBattle(), { ...seats, battlebaseId: CREATOR })).toMatchObject({ opponentId: OPPONENT, guestName: 'opponent' })
})

it('leaves out a battle the account did not play', () => {
  expect(battlebaseBattleImport(concededBattle(), { ...seats, battlebaseId: 'someone-else' }, context)).toBe('not-a-player')
})

it('leaves out an unfinished battle', () => {
  expect(battlebaseBattleImport({ ...concededBattle(), isFinished: false }, seats, context)).toBe('unfinished')
})
