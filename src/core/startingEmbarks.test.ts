import { describe, expect, it } from 'vitest'
import { type Command, fieldedUnits, reduceBattle, startingEmbarkRefusal, startingEmbarks } from './battle'
import { ALICE, PLAYERS, attachedRoster, builtRoster, log, started } from './battle.fixtures'

type Built = NonNullable<Extract<Command, { kind: 'attach-roster' }>['roster']['built']>

/** A list whose last unit is a Rhino of the given capacity, with `embarks` mapping passengers to it. */
function rosterWithRhino(capacity: number, embarks: Record<string, string>, base: Command = builtRoster('Ultramarines', ['A', 'B'])) {
  if (base.kind !== 'attach-roster' || !base.roster.built) throw new Error('expected built roster')
  const built: Built = structuredClone(base.roster.built)
  built.units.push({
    key: 'rhino',
    name: 'Rhino',
    points: 75,
    models: 1,
    transport: true,
    transportRule: `This model has a transport capacity of ${capacity} INFANTRY models.`,
  })
  for (const unit of built.units) if (embarks[unit.key]) unit.startsEmbarkedIn = embarks[unit.key]
  return { ...base, roster: { ...base.roster, built } } satisfies Command
}

const formations = (command: Command) =>
  reduceBattle(PLAYERS, log([ALICE, command])).players[0]?.units.map((unit) => [unit.key, unit.formation, unit.embarkedIn])

describe('starting embarks', () => {
  it('starts a unit embarked where its list says', () => {
    expect(formations(rosterWithRhino(10, { u0: 'rhino' }))).toEqual([
      ['u0', 'embarked', 'rhino'],
      ['u1', 'battlefield', undefined],
      ['rhino', 'battlefield', undefined],
    ])
  })

  it('embarks a character with the unit it joined', () => {
    expect(formations(rosterWithRhino(10, { u0: 'rhino' }, attachedRoster()))).toEqual([
      ['u0', 'embarked', 'rhino'],
      ['u1', 'embarked', 'rhino'],
      ['rhino', 'battlefield', undefined],
    ])
  })

  it('leaves on the battlefield a unit the transport cannot also hold', () => {
    expect(formations(rosterWithRhino(8, { u0: 'rhino', u1: 'rhino' }))).toEqual([
      ['u0', 'embarked', 'rhino'],
      ['u1', 'battlefield', undefined],
      ['rhino', 'battlefield', undefined],
    ])
  })

  it('drops a starting embark in a transport whose capacity cannot be read', () => {
    const command = rosterWithRhino(10, { u0: 'rhino' })
    if (command.kind !== 'attach-roster') throw new Error('expected attach-roster')
    command.roster.built.units[2]!.transportRule = 'This model has a transport capacity of 10 models from 2 units.'
    expect(startingEmbarks(fieldedUnits(command.roster.built.units))[0]?.startingEmbarkRefused).toBe(
      'this transport has no known model capacity',
    )
  })

  it('records on the unit why its starting embark was dropped', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, rosterWithRhino(8, { u0: 'rhino', u1: 'rhino' })]))
    expect(state.players[0]?.units[1]?.startingEmbarkRefused).toBe('this transport can carry at most 8 models')
  })

  it('forgets why a starting embark was dropped once the table moves the unit', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, rosterWithRhino(8, { u0: 'rhino', u1: 'rhino' })],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u1', formation: 'strategic-reserves' }],
      ),
    )
    expect(state.players[0]?.units[1]?.startingEmbarkRefused).toBeUndefined()
  })

  it('keeps a list corrected mid-battle on the battlefield', () => {
    const state = reduceBattle(PLAYERS, log(...started(), [ALICE, rosterWithRhino(10, { u0: 'rhino' })]))
    expect(state.players[0]?.units[0]?.formation).toBe('battlefield')
  })

  it('lets the table change a starting embark during setup', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, rosterWithRhino(10, { u0: 'rhino' })],
        [ALICE, { kind: 'set-unit-formation', unitKey: 'u0', formation: 'strategic-reserves' }],
      ),
    )
    expect([state.players[0]?.units[0]?.formation, state.players[0]?.units[0]?.embarkedIn]).toEqual(['strategic-reserves', undefined])
  })
})

describe('starting embark refusal', () => {
  const units = (capacity: number, embarks: Record<string, string>) => {
    const command = rosterWithRhino(capacity, embarks)
    if (command.kind !== 'attach-roster') throw new Error('expected attach-roster')
    return fieldedUnits(command.roster.built.units)
  }

  it('counts the units already starting aboard', () => {
    expect(startingEmbarkRefusal(units(8, { u0: 'rhino' }), 'u1', 'rhino')?.message).toBe('this transport can carry at most 8 models')
  })

  it('does not count the unit being asked about against itself', () => {
    expect(startingEmbarkRefusal(units(5, { u0: 'rhino' }), 'u0', 'rhino')).toBeNull()
  })

  it('refuses a transport as a passenger', () => {
    expect(startingEmbarkRefusal(units(10, {}), 'rhino', 'rhino')?.message).toBe('a transport cannot embark in another transport')
  })
})
