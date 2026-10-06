import { describe, expect, it } from 'vitest'
import { type Command, reduceBattle, rosterBattleFormat, validate } from './battle'
import { ALICE, BOB, CAROL, builtRoster, log, roster } from './battle.fixtures'

const configure = (limit: number | null = null): Extract<Command, { kind: 'configure-battle' }> => ({
  kind: 'configure-battle',
  limit,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  clockLimitMinutes: null,
})

const army = (limit: number, playerId?: string): Command => {
  const command = builtRoster('Army', ['Unit'])
  if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('Expected a built roster')
  return { ...command, playerId, roster: { ...command.roster, built: { ...command.roster.built, limit } } }
}

describe('battle size from saved rosters', () => {
  it('accepts setup without a preset size', () => {
    expect(validate(reduceBattle([ALICE, BOB], []), ALICE, configure())).toBeNull()
  })

  it('waits for every army before choosing a format', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure()], [ALICE, army(1000)]))
    expect(state.settings.limit).toBeNull()
  })

  it.each([600, 1000, 2000, 3000])('uses the saved %i-point format rather than the army total', (limit) => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure()], [ALICE, army(limit)], [BOB, army(limit)]))
    expect(state.settings.limit).toBe(limit)
  })

  it('keeps mismatched choices so players can align them', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure()], [ALICE, army(600)], [BOB, army(1000)]))
    expect(state.players.map((player) => player.roster?.built?.limit)).toEqual([600, 1000])
  })

  it('refuses to start an uneven matchup', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure()], [ALICE, army(600)], [BOB, army(1000)]))
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('choose matching roster formats for each side')
  })

  it('lets a player replace their army after the format was inferred', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure()], [ALICE, army(2000)], [BOB, army(2000)]))
    expect(validate(state, ALICE, army(1000))).toBeNull()
  })

  it('recomputes the format when both armies are replaced', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log([ALICE, configure()], [ALICE, army(2000)], [BOB, army(2000)], [ALICE, army(1000)], [BOB, army(1000)]),
    )
    expect(state.settings.limit).toBe(1000)
  })

  it('clears the inferred format when an army is removed', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log([ALICE, configure()], [ALICE, army(1000)], [BOB, army(1000)], [ALICE, { kind: 'detach-roster' }]),
    )
    expect(state.settings.limit).toBeNull()
  })

  it('clears the inferred format on reset', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log([ALICE, configure()], [ALICE, army(600)], [BOB, army(600)], [ALICE, { kind: 'reset-setup' }]),
    )
    expect(state.settings.limit).toBeNull()
  })

  it('matches two allied Incursion rosters against a solo Strike Force roster', () => {
    const command = { ...configure(), teamBattle: true, playerCount: 3 } as Command
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log([ALICE, command], [ALICE, army(2000)], [BOB, army(1000)], [CAROL, army(1000)]),
      [0, 1, 1],
    )
    expect(state.settings.limit).toBe(2000)
  })

  it('does not invent a supported format for two allied Colosseum armies', () => {
    const command = { ...configure(), teamBattle: true, playerCount: 4 } as Command
    const state = reduceBattle(
      [ALICE, BOB, CAROL, 'dave'],
      log([ALICE, command], [ALICE, army(600)], [BOB, army(600)], [CAROL, army(600)], ['dave', army(600)]),
      [0, 0, 1, 1],
    )
    expect(state.settings.limit).toBeNull()
  })

  it('explains when equally sized allied armies have no supported table format', () => {
    const state = reduceBattle(
      [ALICE, BOB, CAROL, 'dave'],
      log(
        [ALICE, { ...configure(), teamBattle: true, playerCount: 4 }],
        [ALICE, army(600)],
        [BOB, army(600)],
        [CAROL, army(600)],
        ['dave', army(600)],
      ),
      [0, 0, 1, 1],
    )
    expect(rosterBattleFormat(state).problem).toBe('unsupported')
  })

  it('asks for a manual size when a selected army is text-only', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure()], [ALICE, army(1000)], [BOB, roster('Text army')]))
    expect(rosterBattleFormat(state).problem).toBe('manual')
  })

  it('keeps a text army when its player chooses a manual size', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure()], [ALICE, roster('Text army')], [ALICE, configure(1000)]))
    expect(state.players[0]?.roster?.name).toBe('Text army')
  })

  it('does not replace an army with another format during play', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log([ALICE, configure()], [ALICE, army(1000)], [BOB, army(1000)], [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }]),
    )
    expect(validate(state, ALICE, army(2000))).toBe('that roster does not match the battle size')
  })

  it('keeps historical unconfigured battles unchanged', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, army(1000)], [BOB, army(1000)]))
    expect(state.settings.limit).toBeNull()
  })

  it('preserves a sealed preset and refuses automatic inference for a league battle', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log(
        [ALICE, configure(1000)],
        [ALICE, army(1000)],
        [BOB, army(1000)],
        [ALICE, { kind: 'lock-league-rosters', leagueToken: 'league' }],
      ),
    )
    expect(validate(state, ALICE, configure())).toBe('league roster battle size is sealed')
  })

  it('keeps explicit sizes fixed when a player changes their army', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure(2000)], [ALICE, army(2000)], [BOB, army(2000)]))
    expect(validate(state, ALICE, army(1000))).toBe('that roster does not match the battle size')
  })
})
