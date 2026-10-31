import { describe, expect, it } from 'vitest'
import { type Command, NOTE_MAX_LENGTH, commandRefusal, reduceBattle, validate } from './battle'
import { battleView } from './battleView'
import { battleReport } from './battleReport'
import { standings, type StandingBattle } from './standings'
import { ALICE, BOB, NAMES, PLAYERS, builtRoster, log, roster, text, turns } from './battle.fixtures'

const configure = (settings: Partial<Extract<Command, { kind: 'configure-battle' }>> = {}): Command => ({
  kind: 'configure-battle',
  limit: 2000,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  clockLimitMinutes: null,
  manual: true,
  ...settings,
})

type AttachRoster = Extract<Command, { kind: 'attach-roster' }>
const attach = (command: Command, extra: Partial<AttachRoster>): Command => ({ ...(command as AttachRoster), ...extra })

const prep: AttachRoster['prep'] = {
  stratagems: [{ key: 'insane-bravery', name: 'Insane Bravery', cp: 1, limit: 'battle' }],
  secondaries: [],
  secondaryDeck: [{ key: 'assassination', name: 'Assassination' }],
  primary: { key: 'take-and-hold', name: 'Take and Hold' },
  secondaryMode: 'tactical',
}

/** Both lists in, Alice going first, tracked by hand. */
const manualStart = (): [string, Command][] => [
  [ALICE, configure()],
  [ALICE, roster('Ultramarines')],
  [BOB, roster('Death Guard')],
  [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
]

const fold = (...entries: [string, Command][]) => reduceBattle(PLAYERS, log(...entries))
/** Both turns of one battle round: six phases each. */
const round = (): [string, Command][] => [...turns(6, ALICE), ...turns(6, BOB)]

describe('manual tracking', () => {
  it('records the mode from the battle configuration', () => {
    expect(fold([ALICE, configure()]).settings.manual).toBe(true)
  })

  it('returns to guided tracking when setup chooses a mission pack again', () => {
    expect(fold([ALICE, configure()], [ALICE, configure({ manual: false, missionPackId: 'pack' })]).settings.manual).toBeUndefined()
  })

  it.each([
    ['mission pack', { missionPackId: 'pack' }],
    ['mission twist', { twistId: 'twist' }],
    ['terrain layout', { terrainLayoutId: 'layout' }],
  ])('refuses a manual battle that names a %s', (_name, settings) => {
    expect(commandRefusal(fold(), ALICE, configure(settings))?.code).toBe('manual-tracking')
  })

  it('keeps a sealed event battle on its mission pack', () => {
    const sealed = fold(
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [ALICE, { kind: 'lock-league-rosters', leagueToken: 'league' }],
    )
    expect(commandRefusal(sealed, ALICE, configure({ limit: null }))?.code).toBe('sealed-event-sealed')
  })

  it('cannot switch modes once the battle has started', () => {
    expect(commandRefusal(fold(...manualStart()), ALICE, configure({ manual: false }))?.code).toBe('battle-started')
  })

  it('drops mission cards already prepared when setup switches to manual tracking', () => {
    const state = fold([ALICE, attach(builtRoster('Ultramarines', ['Intercessors']), { prep })], [ALICE, configure()])
    expect(state.players[0]).toMatchObject({ stratagems: [], primaryCard: null, secondaryDeck: null })
  })

  it('ignores mission cards attached with a list once manual tracking is chosen', () => {
    const state = fold([ALICE, configure()], [ALICE, attach(builtRoster('Ultramarines', ['Intercessors']), { prep })])
    expect(state.players[0]).toMatchObject({ stratagems: [], primaryCard: null, secondaryDeck: null })
  })

  it('clears the defender and battlefield when setup switches to manual tracking', () => {
    const state = fold(
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [ALICE, { kind: 'set-battlefield', patternId: 'pattern', terrainLayoutId: 'layout' }],
      [ALICE, { kind: 'set-attacker', attackerId: BOB }],
      [ALICE, configure()],
    )
    expect([state.deploymentId, state.attackerId]).toEqual([null, null])
  })

  it.each<[string, Command]>([
    ['a stratagem', { kind: 'use-stratagem', key: 'insane-bravery' }],
    ['a card draw', { kind: 'draw-secondaries', secondaries: [{ key: 'assassination', name: 'Assassination' }] }],
    ['a card settlement', { kind: 'score-settlement', scores: [{ category: 'primary', delta: 5 }] }],
    ['a scoring review', { kind: 'request-advance' }],
    ['mission cards', { kind: 'set-prep', ...prep }],
    ['a battlefield', { kind: 'set-battlefield', patternId: 'pattern', terrainLayoutId: 'layout' }],
  ])('refuses %s in a manually tracked battle', (_name, command) => {
    expect(commandRefusal(fold(...manualStart()), ALICE, command)?.code).toBe('manual-tracking')
  })

  it('starts without the battlefield, defender or mission cards a guided battle requires', () => {
    const state = fold([ALICE, configure()], [ALICE, roster('Ultramarines')], [BOB, roster('Death Guard')])
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: BOB })).toBeNull()
  })

  it('grants no command points when the battle begins', () => {
    expect(fold(...manualStart()).players.map((player) => player.cp)).toEqual([0, 0])
  })

  it('grants no command points when the turn passes', () => {
    expect(fold(...manualStart(), ...turns(6, ALICE)).players.map((player) => player.cp)).toEqual([0, 0])
  })

  it('lets a side gain more than one command point in a battle round', () => {
    const state = fold(...manualStart(), [ALICE, { kind: 'adjust-cp', delta: 1 }])
    expect(validate(state, ALICE, { kind: 'adjust-cp', delta: 1 })).toBeNull()
  })

  it('still refuses spending command points a side does not have', () => {
    expect(commandRefusal(fold(...manualStart()), ALICE, { kind: 'adjust-cp', delta: -1 })?.code).toBe('not-enough-cp')
  })

  it('refuses a command point change recorded late', () => {
    const state = fold(...manualStart(), [ALICE, { kind: 'advance' }])
    const missed = { round: 1, phase: 'command' as const, turn: ALICE }
    expect(commandRefusal(state, ALICE, { kind: 'adjust-cp', delta: 1, missed })?.code).toBe('manual-tracking')
  })

  it('books entered points against the round they were entered in', () => {
    const state = fold(...manualStart(), [ALICE, { kind: 'score', category: 'primary', delta: 5 }], ...round(), [
      BOB,
      { kind: 'score', category: 'secondary', delta: 3, playerId: ALICE },
    ])
    expect([state.players[0]!.primaryByRound.slice(0, 2), state.players[0]!.secondaryByRound.slice(0, 2)]).toEqual([
      [5, 0],
      [0, 3],
    ])
  })

  it('accepts points past the matched-play guide with no mission to cap them', () => {
    const state = fold(...manualStart(), [ALICE, { kind: 'score', category: 'primary', delta: 60 }])
    expect(validate(state, ALICE, { kind: 'score', category: 'secondary', delta: 50 })).toBeNull()
  })

  it('pays no battle ready bonus', () => {
    const state = fold(
      [ALICE, configure()],
      [ALICE, attach(roster('Ultramarines'), { painted: true })],
      [BOB, attach(roster('Death Guard'), { painted: true })],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    )
    expect(battleView({ token: 't' }, NAMES, state, ALICE).players.map((player) => player.total)).toEqual([0, 0])
  })

  it('offers no missed actions to record', () => {
    const state = fold(...manualStart(), [ALICE, { kind: 'advance' }])
    expect(battleView({ token: 't' }, NAMES, state, ALICE).missedMoments).toEqual([])
  })

  it('finishes the battle as the last turn ends, with nothing left to settle', () => {
    const state = fold(...manualStart(), ...Array.from({ length: 5 }, round).flat())
    expect(state).toMatchObject({ status: 'finished', completionPending: false, result: { reason: 'completed', concededBy: null } })
  })

  it('keeps the battle running until the second player ends the last round', () => {
    const state = fold(...manualStart(), ...Array.from({ length: 4 }, round).flat(), ...turns(6, ALICE))
    expect([state.status, state.round, state.activePlayerId]).toEqual(['playing', 5, BOB])
  })

  it('reports the start and turns without command point grants', () => {
    expect(text(battleReport(NAMES, log(...manualStart(), ...turns(6, ALICE))))).toEqual(
      expect.arrayContaining(['The battle begins, Alice taking the first turn', 'The turn passes to Bob']),
    )
  })

  it('reports a removed score as a removal', () => {
    const history = log(
      ...manualStart(),
      [ALICE, { kind: 'score', category: 'primary', delta: 5 }],
      [ALICE, { kind: 'score', category: 'primary', delta: -2 }],
    )
    expect(text(battleReport(NAMES, history)).at(-1)).toBe('Alice removes 2 primary')
  })

  it('replays the same totals from the log after an undone score', () => {
    const history = log(
      ...manualStart(),
      [ALICE, { kind: 'score', category: 'primary', delta: 5 }],
      [BOB, { kind: 'score', category: 'primary', delta: 4 }],
      [BOB, { kind: 'undo', target: 6 }],
    )
    expect(reduceBattle(PLAYERS, history).players.map((player) => player.primary)).toEqual([5, 0])
  })
})

describe('battle notes', () => {
  it('adds a note to the battle report', () => {
    const history = log(...manualStart(), [BOB, { kind: 'add-note', text: '  Objective 3 contested  ' }])
    expect(text(battleReport(NAMES, history)).at(-1)).toBe('Bob notes: Objective 3 contested')
  })

  it('accepts a note in a guided battle too', () => {
    const state = fold(
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    )
    expect(validate(state, ALICE, { kind: 'add-note', text: 'Rain on the left flank' })).toBeNull()
  })

  it('refuses a note before the battle begins', () => {
    expect(commandRefusal(fold([ALICE, configure()]), ALICE, { kind: 'add-note', text: 'Early' })?.code).toBe('battle-not-running')
  })

  it('refuses an empty note', () => {
    expect(commandRefusal(fold(...manualStart()), ALICE, { kind: 'add-note', text: '   ' })?.code).toBe('invalid-note')
  })

  it('refuses a note longer than the limit', () => {
    expect(commandRefusal(fold(...manualStart()), ALICE, { kind: 'add-note', text: 'x'.repeat(NOTE_MAX_LENGTH + 1) })?.code).toBe(
      'invalid-note',
    )
  })

  it('takes a note back with undo', () => {
    const history = log(...manualStart(), [ALICE, { kind: 'add-note', text: 'Wrong table' }], [ALICE, { kind: 'undo', target: 5 }])
    expect(text(battleReport(NAMES, history))).not.toContain('Alice notes: Wrong table')
  })
})

describe('manual battles in the leaderboard', () => {
  const finished = (manual: boolean): StandingBattle => ({
    status: 'finished',
    playerIds: PLAYERS,
    players: ['Alice', 'Bob'],
    sides: [0, 1],
    scores: [20, 10],
    factions: [null, null],
    result: null,
    lastActivity: 1,
    settings: manual ? { manual: true } : {},
  })

  it('leaves a manually tracked battle out of the ratings', () => {
    expect(standings([finished(true)]).overall).toEqual([])
  })

  it('still rates a guided battle', () => {
    expect(standings([finished(false)]).overall).toHaveLength(2)
  })
})
