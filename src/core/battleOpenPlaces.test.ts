import { describe, expect, it } from 'vitest'
import { type Command, commandRefusal, openPlaces, reduceBattle, sharedSidePoints, shortSides, stillFilling } from './battle'
import { ALICE, BOB, CAROL, builtRoster, log, roster } from './battle.fixtures'

const draft = (places: [number, number] = [1, 1]): Extract<Command, { kind: 'configure-battle' }> => ({
  kind: 'configure-battle',
  limit: null,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  teamBattle: places[0] + places[1] > 2,
  places,
  clockLimitMinutes: null,
})

describe('a battle with open places', () => {
  it('counts the places nobody has joined on each side', () => {
    expect(openPlaces(reduceBattle([ALICE], log([ALICE, draft([2, 1])]), [0]))).toEqual([1, 1])
  })

  it('stays a draft while a place is open, even with every seated army chosen', () => {
    expect(stillFilling(reduceBattle([ALICE], log([ALICE, draft()], [ALICE, roster('Mine')]), [0]))).toBe(true)
  })

  it('stops being a draft once every place is filled and every army chosen', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, draft()], [ALICE, roster('Mine')], [BOB, roster('Theirs')]), [0, 1])
    expect(stillFilling(state)).toBe(false)
  })

  it('refuses to begin while a place is open', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, draft([2, 1])], [ALICE, roster('Mine')], [BOB, roster('Theirs')]), [0, 1])
    expect(commandRefusal(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })?.code).toBe('missing-player')
  })

  it('refuses to take away a place someone has joined', () => {
    const state = reduceBattle([ALICE, BOB, CAROL], log([ALICE, draft([2, 1])]), [0, 0, 1])
    expect(commandRefusal(state, ALICE, draft([1, 1]))?.code).toBe('too-few-seats')
  })

  it('adds an ally on either side before the battle starts', () => {
    const state = reduceBattle([ALICE], log([ALICE, draft()]), [0])
    expect(commandRefusal(state, ALICE, draft([1, 2]))).toBeNull()
  })

  it('drops what was done for a player once they leave, rather than giving it to whoever did it', () => {
    const forBob: Command = { kind: 'attach-roster', playerId: BOB, roster: { name: 'Theirs', text: 'units' } }
    // Bob joined, Alice chose his army, then Bob was removed before the start.
    const state = reduceBattle([ALICE], log([ALICE, draft()], [ALICE, roster('Mine')], [ALICE, forBob]), [0])
    expect(state.players[0]!.roster?.name).toBe('Mine')
  })
  it('keeps its open places through a setup change that leaves them out', () => {
    const { places: _places, ...withoutPlaces } = draft([1, 1]) as Extract<Command, { kind: 'configure-battle' }>
    const state = reduceBattle([ALICE], log([ALICE, draft()], [ALICE, { ...withoutPlaces, missionPackId: 'pack' }]), [0])
    expect(openPlaces(state)).toEqual([0, 1])
  })
  it('says no side plays short while a side is still empty', () => {
    const state = reduceBattle([ALICE], log([ALICE, { ...draft(), sizeFromSides: true }], [ALICE, builtRoster('Mine', ['Unit'])]), [0])
    expect(shortSides(state)).toEqual([])
  })

  it('sizes a pair with an open ally place as if the ally brought their partner’s list', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log([ALICE, { ...draft([2, 1]), sizeFromSides: true }], [ALICE, incursion('Mine')], [BOB, incursion('Theirs')]),
      [0, 1],
    )
    expect(state.settings.limit).toBe(2000)
  })

  it('shares a pair’s points while their ally place is still open', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log([ALICE, { ...draft([2, 1]), sizeFromSides: true }], [ALICE, incursion('Mine')], [BOB, builtRoster('Theirs', ['Unit'])]),
      [0, 1],
    )
    expect(sharedSidePoints(state, 0)).toBe(2000)
  })
})

function incursion(name: string): Command {
  const list = builtRoster(name, ['Unit']) as Extract<Command, { kind: 'attach-roster' }>
  return { ...list, roster: { ...list.roster, built: { ...list.roster.built!, limit: 1000 } } }
}
