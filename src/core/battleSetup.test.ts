import { describe, expect, it } from 'vitest'
import { battlePointsBudget, battleSizeText, type Command, reduceBattle, rosterBattleFormat, validate } from './battle'
import { ALICE, BOB, CAROL, builtRoster, log, roster } from './battle.fixtures'

const configure = (limit: number | null = null): Extract<Command, { kind: 'configure-battle' }> => ({
  kind: 'configure-battle',
  limit,
  missionPackId: null,
  terrainLayoutId: null,
  twistId: null,
  clockLimitMinutes: null,
})

const army = (limit: number, playerId?: string, pointsBudget?: number): Command => {
  const command = builtRoster('Army', ['Unit'])
  if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('Expected a built roster')
  return {
    ...command,
    playerId,
    roster: { ...command.roster, built: { ...command.roster.built, limit, ...(pointsBudget ? { pointsBudget } : {}) } },
  }
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

  it('preserves a sealed preset and refuses automatic inference for a sealed event battle', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log(
        [ALICE, configure(1000)],
        [ALICE, army(1000)],
        [BOB, army(1000)],
        [ALICE, { kind: 'lock-league-rosters', leagueToken: 'league' }],
      ),
    )
    expect(validate(state, ALICE, configure())).toBe('this battle’s size is sealed')
  })

  it('keeps explicit sizes fixed when a player changes their army', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure(2000)], [ALICE, army(2000)], [BOB, army(2000)]))
    expect(validate(state, ALICE, army(1000))).toBe('that roster does not match the battle size')
  })

  it('keeps the battle size from the formats when both armies agree on a custom points budget', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log([ALICE, configure()], [ALICE, army(2000, undefined, 1500)], [BOB, army(2000, undefined, 1500)]),
    )
    expect([state.settings.limit, battlePointsBudget(state)]).toEqual([2000, 1500])
  })

  it('names the agreed custom points budget beside the battle size', () => {
    const state = reduceBattle(
      [ALICE, BOB],
      log([ALICE, configure()], [ALICE, army(2000, undefined, 1500)], [BOB, army(2000, undefined, 1500)]),
    )
    expect(battleSizeText(state)).toBe('Strike Force · 1,500-point budget')
  })

  it('asks players to align armies of one battle size with different points budgets', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure()], [ALICE, army(2000, undefined, 1500)], [BOB, army(2000)]))
    expect([state.settings.limit, rosterBattleFormat(state).problem]).toEqual([null, 'budget-mismatch'])
  })

  it('refuses to start a battle of an explicit size whose armies bring different points budgets', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, configure(2000)], [ALICE, army(2000, undefined, 2500)], [BOB, army(2000)]))
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('choose matching points budgets for each side')
  })
})

describe('team battle points', () => {
  const teamBattle = (limit: number | null, armyPoints?: number[]) =>
    ({ ...configure(limit), teamBattle: true, playerCount: 3, ...(armyPoints ? { armyPoints } : {}) }) as Command
  /** A list of `units` 100-point units, saved at `limit` with an optional points total and waivers. */
  const list = (playerId: string, limit: number, units: number, pointsBudget?: number, waivedRules?: string[]): Command => {
    const command = army(limit, playerId, pointsBudget)
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('Expected a built roster')
    const built = command.roster.built
    return {
      ...command,
      roster: {
        ...command.roster,
        built: {
          ...built,
          ...(waivedRules ? { waivedRules } : {}),
          units: Array.from({ length: units }, (_, index) => ({ ...built.units[0]!, key: `u${index}` })),
        },
      },
    } as Command
  }
  const table = (...commands: Command[]) =>
    reduceBattle([ALICE, BOB, CAROL], log(...commands.map((command) => [ALICE, command] as [string, Command])), [0, 1, 1])
  const begin: Command = { kind: 'begin-battle', firstPlayerId: ALICE }

  it('lets an ally bring a list smaller than the battle size', () => {
    const state = table(teamBattle(2000), list(ALICE, 2000, 10), list(BOB, 1000, 5), list(CAROL, 1000, 5))
    expect(validate(state, ALICE, begin)).toBeNull()
  })

  it('refuses a list built bigger than the battle size', () => {
    const state = table(teamBattle(2000))
    expect(validate(state, ALICE, list(BOB, 3000, 5))).toBe('that roster does not match the battle size')
  })

  it('accepts a bigger list that waives its points limit', () => {
    const state = table(teamBattle(2000))
    expect(validate(state, ALICE, list(BOB, 3000, 5, undefined, ['points-limit']))).toBeNull()
  })

  it('takes the battle size from the biggest list', () => {
    const state = table(teamBattle(null), list(ALICE, 2000, 10), list(BOB, 1000, 5), list(CAROL, 1000, 5))
    expect(state.settings.limit).toBe(2000)
  })

  it('refuses an army spending more than its side’s points per army', () => {
    const state = table(teamBattle(2000, [1750, 800]), list(ALICE, 2000, 17), list(BOB, 1000, 9), list(CAROL, 1000, 8))
    expect(validate(state, ALICE, begin)).toBe('an army spends more than its 800 points')
  })

  it('starts uneven sides within their own points per army', () => {
    const state = table(teamBattle(2000, [1750, 800]), list(ALICE, 2000, 17), list(BOB, 1000, 8), list(CAROL, 1000, 8))
    expect(validate(state, ALICE, begin)).toBeNull()
  })

  it('starts allies who share their points with an uneven split', () => {
    const shared = { ...teamBattle(2000), sharedArmyPoints: true } as Command
    const state = table(shared, list(ALICE, 2000, 20), list(BOB, 2000, 11), list(CAROL, 1000, 9))
    expect(validate(state, ALICE, begin)).toBeNull()
  })

  it('refuses allies who share their points spending past their side’s total', () => {
    const shared = { ...teamBattle(2000), sharedArmyPoints: true } as Command
    const state = table(shared, list(ALICE, 2000, 20), list(BOB, 2000, 11), list(CAROL, 1000, 10))
    expect(validate(state, ALICE, begin)).toBe('allies spend more than their 2,000 points')
  })

  it('names each side’s points per army beside the battle size', () => {
    const state = table(teamBattle(2000, [1750, 800]), list(ALICE, 2000, 17), list(BOB, 1000, 8), list(CAROL, 1000, 8))
    expect(battleSizeText(state)).toBe('Strike Force · 1,750 vs 800 + 800')
  })

  it('refuses points per army for a duel', () => {
    const state = reduceBattle([ALICE, BOB], [])
    expect(validate(state, ALICE, { ...configure(2000), armyPoints: [1000, 1000] })).toBe('only a team battle sets points per army')
  })
})
