import { describe, expect, it } from 'vitest'
import { type BattleMoment, type Command, commandRefusal, type LoggedCommand, reduceBattle } from './battle'
import { battleReport } from './battleReport'
import { battleTimeline } from './battleReplay'
import { battleView } from './battleView'
import { ALICE, BOB, NAMES, PLAYERS, log, started, turns } from './battle.fixtures'

const GRENADE = { key: 'grenade', name: 'Grenade', cp: 1, limit: 'phase' as const }
const SMOKE = { key: 'smoke', name: 'Smokescreen', cp: 1, limit: 'turn' as const }
const BRAVERY = {
  key: 'bravery',
  name: 'Insane Bravery',
  cp: 1,
  limit: 'battle' as const,
  phases: ['command' as const],
  turn: 'your-turn' as const,
}
const OVERWATCH = { key: 'overwatch', name: 'Fire Overwatch', cp: 1, limit: 'turn' as const, turn: 'opponent-turn' as const }
const NEW_ORDERS = { key: 'new-orders', name: 'New Orders', cp: 1, limit: 'battle' as const }
const CARD = { key: 'card', name: 'Assassination' }
const LATER_CARD = { key: 'later', name: 'Cleanse' }

const at = (round: number, phase: BattleMoment['phase'], turn = ALICE): BattleMoment => ({ round, phase, turn })

const armed = (...after: [string, Command][]): [string, Command][] => [
  ...started(),
  [
    ALICE,
    {
      kind: 'set-prep',
      stratagems: [GRENADE, SMOKE, BRAVERY, OVERWATCH, NEW_ORDERS],
      secondaries: [CARD],
      primary: null,
      secondaryMode: 'fixed',
    },
  ],
  ...after,
]

/** Alice's second turn, with both sides having gained a command point for each turn since. */
const roundTwo = (): [string, Command][] => [...turns(6, ALICE), ...turns(6, BOB)]

const state = (history: [string, Command][]) => reduceBattle(PLAYERS, log(...history))
const refusal = (history: [string, Command][], command: Command, by = ALICE) => commandRefusal(state(history), by, command)
const alice = (history: [string, Command][]) => state(history).players.find((player) => player.id === ALICE)!

/** Appends a command only when the domain accepts it, as the repository does. */
const accepted = (history: [string, Command][], command: Command, by = ALICE): [string, Command][] => {
  const refused = refusal(history, command, by)
  if (refused) throw new Error(refused.message)
  return [...history, [by, command]]
}

describe('missed stratagems', () => {
  it('belong to the phase they were missed in', () => {
    const history = accepted(armed(...turns(1, ALICE)), { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'command') })
    expect(alice(history).uses.at(-1)).toMatchObject({ round: 1, phase: 'command', turn: ALICE })
  })

  it('spend command points when they are recorded', () => {
    const history = accepted(armed(...turns(1, ALICE)), { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'command') })
    expect(alice(history).cp).toBe(0)
  })

  it('lower the command points recorded for the round they belong to', () => {
    const before = armed(...roundTwo())
    const history = accepted(before, { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'fight', BOB) })
    expect(alice(history).cpByRound[0]).toBe(alice(before).cpByRound[0]! - 1)
  })

  it('are refused for the moment being played', () => {
    expect(refusal(armed(...turns(1, ALICE)), { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'movement') })?.code).toBe(
      'missed-moment',
    )
  })

  it('are refused for a moment that has not happened yet', () => {
    expect(refusal(armed(...turns(1, ALICE)), { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'shooting') })?.code).toBe(
      'missed-moment',
    )
  })

  it('are refused before the previous battle round', () => {
    const history = armed(...roundTwo(), ...roundTwo())
    expect(refusal(history, { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'fight', BOB) })?.message).toBe(
      'a missed action belongs to an earlier phase of this battle round or the previous one',
    )
  })

  it('are allowed throughout the previous battle round', () => {
    const history = armed(...roundTwo(), ...roundTwo())
    expect(refusal(history, { kind: 'use-stratagem', key: 'grenade', missed: at(2, 'command') })).toBeNull()
  })

  it('are refused in a phase the stratagem cannot be used in', () => {
    expect(refusal(armed(...turns(2, ALICE)), { kind: 'use-stratagem', key: 'bravery', missed: at(1, 'movement') })?.message).toBe(
      'Insane Bravery cannot be used in that phase',
    )
  })

  it('are allowed in the phase the stratagem is used in, from a later phase', () => {
    expect(refusal(armed(...turns(2, ALICE)), { kind: 'use-stratagem', key: 'bravery', missed: at(1, 'command') })).toBeNull()
  })

  it('are refused in the opponent’s turn when the stratagem is used on your own', () => {
    expect(refusal(armed(...roundTwo()), { kind: 'use-stratagem', key: 'bravery', missed: at(1, 'command', BOB) })?.message).toBe(
      'Insane Bravery is used on your turn',
    )
  })

  it('are allowed in the opponent’s turn when the stratagem is used then', () => {
    expect(refusal(armed(...roundTwo()), { kind: 'use-stratagem', key: 'overwatch', missed: at(1, 'shooting', BOB) })).toBeNull()
  })

  it('are refused in your own turn when the stratagem is used on your opponent’s', () => {
    expect(refusal(armed(...roundTwo()), { kind: 'use-stratagem', key: 'overwatch', missed: at(1, 'shooting') })?.code).toBe(
      'stratagem-wrong-turn',
    )
  })

  it('are refused once a once-per-battle stratagem has been used later', () => {
    const history = accepted(armed(...roundTwo()), { kind: 'use-stratagem', key: 'bravery' })
    expect(refusal(history, { kind: 'use-stratagem', key: 'bravery', missed: at(1, 'command') })?.message).toBe(
      'Insane Bravery has been used this battle',
    )
  })

  it('are refused in a phase that already used its allowance', () => {
    const history = accepted(armed([ALICE, { kind: 'adjust-cp', delta: 1 }]), { kind: 'use-stratagem', key: 'grenade' })
    expect(refusal([...history, ...turns(1, ALICE)], { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'command') })?.message).toBe(
      'Grenade has been used that phase',
    )
  })

  it('are allowed in another phase that has not used its allowance', () => {
    const history = accepted([...armed(), [ALICE, { kind: 'adjust-cp', delta: 1 }]], { kind: 'use-stratagem', key: 'grenade' })
    expect(refusal([...history, ...turns(2, ALICE)], { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'movement') })).toBeNull()
  })

  it('take the allowance the current moment would otherwise use', () => {
    const history = accepted([...armed(...turns(2, ALICE)), [ALICE, { kind: 'adjust-cp', delta: 1 }]], {
      kind: 'use-stratagem',
      key: 'smoke',
      missed: at(1, 'command'),
    })
    expect(refusal(history, { kind: 'use-stratagem', key: 'smoke' })?.message).toBe('Smokescreen has been used this turn')
  })

  it('are refused when the same missed use is submitted twice', () => {
    const missed: Command = { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'command') }
    const history = accepted(armed([ALICE, { kind: 'adjust-cp', delta: 1 }], ...turns(1, ALICE)), missed)
    expect(refusal(history, missed)?.code).toBe('stratagem-limit')
  })

  it('are refused when a later moment could not have afforded them', () => {
    const spent = accepted(armed(), { kind: 'use-stratagem', key: 'grenade' })
    const history: [string, Command][] = [...spent, ...turns(6, ALICE)]
    expect([alice(history).cp, refusal(history, { kind: 'use-stratagem', key: 'smoke', missed: at(1, 'movement') })?.message]).toEqual([
      1,
      'that would leave too few command points at a later moment',
    ])
  })

  it('are placed at the end of their phase, after a gain within it', () => {
    const spent = accepted(armed(), { kind: 'use-stratagem', key: 'grenade' })
    const history: [string, Command][] = [...spent, [ALICE, { kind: 'adjust-cp', delta: 1 }], ...turns(1, ALICE)]
    expect(refusal(history, { kind: 'use-stratagem', key: 'smoke', missed: at(1, 'command') })).toBeNull()
  })

  it('are allowed when every moment since could afford them', () => {
    expect(refusal(armed(...turns(6, ALICE)), { kind: 'use-stratagem', key: 'smoke', missed: at(1, 'movement') })).toBeNull()
  })

  it('refuse New Orders, which draws a replacement card', () => {
    expect(refusal(armed(...turns(1, ALICE)), { kind: 'use-stratagem', key: 'new-orders', missed: at(1, 'command') })?.code).toBe(
      'missed-unsupported',
    )
  })

  it('are taken back by undo with their command points', () => {
    const history = accepted(armed(...turns(1, ALICE)), { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'command') })
    const undone: [string, Command][] = [...history, [BOB, { kind: 'undo', target: history.length }]]
    expect([alice(undone).cp, alice(undone).uses]).toEqual([1, []])
  })
})

describe('missed command point gains', () => {
  it('count against the battle round they belong to', () => {
    const history = accepted(armed(...roundTwo()), { kind: 'adjust-cp', delta: 1, missed: at(1, 'end', BOB) })
    expect([alice(history).bonusCpByRound[0], alice(history).bonusCpByRound[1]]).toEqual([1, 0])
  })

  it('are refused for a round that already gained its additional point', () => {
    const history = armed([ALICE, { kind: 'adjust-cp', delta: 1 }], ...roundTwo())
    expect(refusal(history, { kind: 'adjust-cp', delta: 1, missed: at(1, 'end', BOB) })?.code).toBe('cp-gain-limit')
  })

  it('are allowed for the previous round when this round already gained', () => {
    const history = armed(...roundTwo(), [ALICE, { kind: 'adjust-cp', delta: 1 }])
    expect(refusal(history, { kind: 'adjust-cp', delta: 1, missed: at(1, 'end', BOB) })).toBeNull()
  })

  it('refuse a spend recorded as a negative adjustment', () => {
    expect(refusal(armed(...turns(1, ALICE)), { kind: 'adjust-cp', delta: -1, missed: at(1, 'command') })?.code).toBe('missed-unsupported')
  })

  it('pay for a missed spend in a moment after the gain', () => {
    const spent = accepted(armed(), { kind: 'use-stratagem', key: 'grenade' })
    const gained = accepted([...spent, ...turns(6, ALICE)], { kind: 'adjust-cp', delta: 1, missed: at(1, 'command') })
    expect(refusal(gained, { kind: 'use-stratagem', key: 'smoke', missed: at(1, 'movement') })).toBeNull()
  })
})

describe('missed scores', () => {
  const primary = (delta: number, moment: BattleMoment): Command => ({
    kind: 'score-settlement',
    scores: [{ category: 'primary', delta }],
    missed: moment,
  })

  it('bank in the round they belong to', () => {
    const history = accepted(armed(...roundTwo()), primary(4, at(1, 'end')))
    expect(alice(history).primaryByRound.slice(0, 2)).toEqual([4, 0])
  })

  it('leave the current scoring review open', () => {
    const history = accepted(armed(...roundTwo(), [ALICE, { kind: 'request-advance' }]), primary(4, at(1, 'end')))
    expect(state(history).scoringAcknowledged).toBe(false)
  })

  it('refuse a settlement round alongside their moment', () => {
    expect(refusal(armed(...roundTwo()), { ...primary(4, at(1, 'end')), round: 1 } as Command)?.code).toBe('missed-unsupported')
  })

  it('refuse end-of-battle points', () => {
    const command: Command = {
      kind: 'score-settlement',
      scores: [{ category: 'primary', delta: 4, final: { claims: [1], delta: 4 } }],
      missed: at(1, 'end'),
    }
    expect(refusal(armed(...roundTwo()), command)?.message).toBe('end-of-battle points cannot be recorded late')
  })

  it('refuse a secondary mission no longer held', () => {
    const history = armed(...roundTwo(), [ALICE, { kind: 'set-secondary-status', key: CARD.key, status: 'discarded' }])
    const command: Command = {
      kind: 'score-settlement',
      scores: [{ category: 'secondary', key: CARD.key, delta: 3 }],
      missed: at(1, 'end'),
    }
    expect(refusal(history, command)?.message).toBe('only a secondary mission still held can be scored late')
  })

  it('refuse a secondary mission drawn after that moment', () => {
    const history = armed(...roundTwo(), [ALICE, { kind: 'draw-secondary', secondary: LATER_CARD }], ...turns(1, ALICE))
    const command: Command = {
      kind: 'score-settlement',
      scores: [{ category: 'secondary', key: LATER_CARD.key, delta: 3 }],
      missed: at(1, 'end'),
    }
    expect(refusal(history, command)?.message).toBe('that secondary mission had not been drawn yet')
  })

  it('allow a secondary mission in the moment it was drawn', () => {
    const history = armed(...roundTwo(), [ALICE, { kind: 'draw-secondary', secondary: LATER_CARD }], ...turns(1, ALICE))
    const command: Command = {
      kind: 'score-settlement',
      scores: [{ category: 'secondary', key: LATER_CARD.key, delta: 3 }],
      missed: at(2, 'command'),
    }
    expect(refusal(history, command)).toBeNull()
  })

  it('keep a secret mission’s name from the opponent', () => {
    const secret = { key: 'secret', name: 'Hidden Vigil' }
    const history = accepted(armed([ALICE, { kind: 'select-secret', secondary: secret }], ...roundTwo()), {
      kind: 'score-settlement',
      scores: [{ category: 'secondary', key: secret.key, delta: 3 }],
      missed: at(1, 'end'),
    })
    expect(battleReport(NAMES, log(...history), PLAYERS, BOB).at(-1)?.text).toBe(
      'Alice settles 3 VP on a secret mission, recorded late for round 1, Alice’s end phase',
    )
  })
})

describe('missed actions in the record', () => {
  const recorded = (): LoggedCommand[] =>
    log(...accepted(armed(...turns(2, ALICE)), { kind: 'use-stratagem', key: 'grenade', missed: at(1, 'command') }))

  it('name the moment they belong to', () => {
    expect(battleReport(NAMES, recorded()).at(-1)?.text).toBe(
      'Alice uses Grenade for 1 CP, recorded late for round 1, Alice’s command phase',
    )
  })

  it('keep the moment they were recorded in', () => {
    expect(battleReport(NAMES, recorded()).at(-1)).toMatchObject({ round: 1, phase: 'shooting' })
  })

  it('replay where they were recorded', () => {
    expect(battleTimeline(PLAYERS, recorded()).at(-1)).toMatchObject({ round: 1, phase: 'shooting' })
  })
})

describe('missed moments', () => {
  it('offer every earlier phase of this battle round and the previous one, oldest first', () => {
    const moments = battleView({ token: 't' }, NAMES, state(armed(...roundTwo(), ...turns(1, ALICE))), ALICE).missedMoments
    expect([moments?.length, moments?.[0], moments?.at(-1)]).toEqual([13, at(1, 'command'), at(2, 'command')])
  })

  it('offer nothing before the battle begins', () => {
    expect(battleView({ token: 't' }, NAMES, state(started().slice(0, 2)), ALICE).missedMoments).toEqual([])
  })
})
