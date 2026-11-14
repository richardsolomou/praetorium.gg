import { describe, expect, it } from 'vitest'
import { type Command, type LoggedCommand, reduceBattle, validate } from './battle'
import { advanceTimes, battleClock, clockMs, latestTurnRound, remainingMs } from './battleClock'
import { ALICE, BOB, PLAYERS, advance, log, started, turns } from './battle.fixtures'

const MINUTE = 60_000

/** One minute between consecutive commands, so a span reads as a count of them. */
const minutes = (history: LoggedCommand[]) => history.map((entry) => ({ ...entry, at: entry.at * MINUTE }))

const clockOf = (...entries: [string, Command][]) => battleClock(PLAYERS, minutes(log(...entries)))

const advancesOf = (...entries: [string, Command][]) => advanceTimes(PLAYERS, minutes(log(...entries)))

const score: Command = { kind: 'score', category: 'primary', delta: 1 }

const toBob: Command = { kind: 'switch-clock', side: 1 }

const limited = (clockLimitMinutes: number): [string, Command] => [
  ALICE,
  { kind: 'configure-battle', limit: null, missionPackId: null, terrainLayoutId: null, twistId: null, clockLimitMinutes },
]

/** Bob's first turn undone back into Alice's end phase, which she then ends again as seq 14. */
const rewound = (): [string, Command][] => [
  ...started(),
  ...turns(6, ALICE),
  [BOB, score],
  [BOB, { kind: 'undo', target: 10 }],
  [BOB, { kind: 'undo', target: 9 }],
  [ALICE, score],
  [ALICE, advance()],
]

describe('the battle clock', () => {
  it('counts nothing while the battle is in setup', () => {
    expect(clockOf(...started().slice(0, 2)).spans).toEqual([])
  })

  it('gives the time between commands to the active side’s phase', () => {
    const clock = clockOf(...started(), [ALICE, advance()])
    expect(clock.spans).toEqual([{ side: 0, round: 1, phase: 'command', ms: MINUTE }])
  })

  it('runs in the phase the latest command left the battle in', () => {
    const clock = clockOf(...started(), [ALICE, advance()])
    expect(clock.running).toEqual({ side: 0, round: 1, phase: 'movement', since: 3 * MINUTE })
  })

  it('counts the running stretch up to now', () => {
    const clock = clockOf(...started(), [ALICE, advance()])
    expect(clockMs(clock, 8 * MINUTE, { side: 0, phase: 'movement' })).toBe(5 * MINUTE)
  })

  it('leaves the running stretch out without a current time', () => {
    const clock = clockOf(...started(), [ALICE, advance()])
    expect(clockMs(clock, null, { side: 0 })).toBe(MINUTE)
  })

  it('keeps time spent in a turn that is later undone with that turn', () => {
    const clock = clockOf(...rewound())
    expect(clockMs(clock, null, { side: 1, round: 1 })).toBe(3 * MINUTE)
  })

  it('adds time spent back in a rewound phase to that phase', () => {
    const clock = clockOf(...rewound())
    expect(clockMs(clock, null, { side: 0, round: 1, phase: 'end' })).toBe(3 * MINUTE)
  })

  it('counts nothing while the timer is paused', () => {
    const clock = clockOf(
      ...started(),
      [ALICE, { kind: 'pause-clock' }],
      [ALICE, score],
      [BOB, { kind: 'resume-clock' }],
      [ALICE, advance()],
    )
    expect(clockMs(clock, null, { side: 0, phase: 'command' })).toBe(2 * MINUTE)
  })

  it('stops running while the timer is paused', () => {
    expect(clockOf(...started(), [ALICE, { kind: 'pause-clock' }])).toMatchObject({ running: null, paused: true })
  })

  it('stops running once the battle ends', () => {
    expect(clockOf(...started(), [ALICE, { kind: 'end-battle' }]).running).toBeNull()
  })

  it('names the latest round each side has played', () => {
    const clock = clockOf(...started(), ...turns(6, ALICE), ...turns(6, BOB), [ALICE, advance()])
    expect([latestTurnRound(clock, 0), latestTurnRound(clock, 1)]).toEqual([2, 1])
  })

  it('names no round for a side that has not played', () => {
    expect(latestTurnRound(clockOf(...started()), 1)).toBeNull()
  })
})

describe('the time an advance closes', () => {
  it('is the phase it ends', () => {
    expect(advancesOf(...started(), [ALICE, advance()]).get(4)).toEqual({ phase: MINUTE, turn: null })
  })

  it('includes the turn when the advance passes it', () => {
    expect(advancesOf(...started(), ...turns(6, ALICE)).get(9)).toEqual({ phase: MINUTE, turn: 6 * MINUTE })
  })

  it('keeps the phase’s time from before an undo', () => {
    expect(advancesOf(...rewound()).get(14)?.phase).toBe(3 * MINUTE)
  })

  it('keeps the turn’s time from before an undo', () => {
    expect(advancesOf(...rewound()).get(14)?.turn).toBe(8 * MINUTE)
  })

  it('is still the phase when the timer is paused', () => {
    expect(advancesOf(...started(), [ALICE, { kind: 'pause-clock' }], [ALICE, advance()]).get(5)).toEqual({ phase: MINUTE, turn: null })
  })
})

describe('pausing the timer', () => {
  it('is refused during setup', () => {
    expect(validate(reduceBattle(PLAYERS, log()), ALICE, { kind: 'pause-clock' })).toBe('the battle is not running')
  })

  it('is refused while already paused', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, { kind: 'pause-clock' }]))
    expect(validate(state, BOB, { kind: 'pause-clock' })).toBe('the timer is already paused')
  })

  it('refuses resuming a running timer', () => {
    expect(validate(reduceBattle(PLAYERS, log(...started())), ALICE, { kind: 'resume-clock' })).toBe('the timer is already running')
  })

  it('is not what undo takes back', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, advance()], [ALICE, { kind: 'pause-clock' }]))
    expect(state.undoable?.kind).toBe('advance')
  })

  it('ends when the battle is reopened', () => {
    const state = reduceBattle(
      PLAYERS,
      log(...started(), [ALICE, { kind: 'pause-clock' }], [ALICE, { kind: 'end-battle' }], [ALICE, { kind: 'reopen-battle' }]),
    )
    expect(state.clockPaused).toBe(false)
  })
})

describe('switching the clock', () => {
  it('gives the time to the side it names', () => {
    const clock = clockOf(...started(), [BOB, toBob], [BOB, score], [BOB, { kind: 'switch-clock', side: 0 }])
    expect([clockMs(clock, null, { side: 0 }), clockMs(clock, null, { side: 1 })]).toEqual([MINUTE, 2 * MINUTE])
  })

  it('hands the clock back when the phase ends', () => {
    expect(clockOf(...started(), [BOB, toBob], [ALICE, advance()]).running?.side).toBe(0)
  })

  it('leaves a reaction out of the phase time the advance reports', () => {
    expect(advancesOf(...started(), [BOB, toBob], [ALICE, advance()]).get(5)).toEqual({ phase: MINUTE, turn: null })
  })

  it('is refused for the side that already has the clock', () => {
    expect(validate(reduceBattle(PLAYERS, log(...started())), ALICE, { kind: 'switch-clock', side: 0 })).toBe(
      'that side already has the clock',
    )
  })

  it('is not what undo takes back', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, advance()], [BOB, toBob]))
    expect(state.undoable?.kind).toBe('advance')
  })
})

describe('the clock limit', () => {
  it('counts each side’s time down from the limit', () => {
    const clock = clockOf(limited(90), ...started(), [ALICE, advance()])
    expect(remainingMs(clock, 10 * MINUTE, 0)).toBe(83 * MINUTE)
  })

  it('goes past zero once a side runs out', () => {
    const clock = clockOf(limited(5), ...started())
    expect(remainingMs(clock, 13 * MINUTE, 0)).toBe(-5 * MINUTE)
  })

  it('is absent unless the table set one', () => {
    expect(remainingMs(clockOf(...started()), 10 * MINUTE, 0)).toBeNull()
  })
})
