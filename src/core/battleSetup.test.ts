import { describe, expect, it } from 'vitest'
import { battlePointsBudget, battleSizeText, type Command, reduceBattle, rosterBattleFormat, shortSides, validate } from './battle'
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
        [ALICE, { kind: 'lock-sealed-event-rosters', sealedEventToken: 'tournament' }],
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

  it('refuses a pair spending more than twice its points per army', () => {
    const state = table(teamBattle(2000, [1750, 800]), list(ALICE, 2000, 17), list(BOB, 1000, 9), list(CAROL, 1000, 8))
    expect(validate(state, ALICE, begin)).toBe('allies spend more than their 1,600 points')
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

  it('reads an older pair’s points per ally as their shared total', () => {
    const state = table(teamBattle(2000, [1750, 800]), list(ALICE, 2000, 17), list(BOB, 1000, 8), list(CAROL, 1000, 8))
    expect(battleSizeText(state)).toBe('Strike Force · 1,750 vs 1,600 shared')
  })

  it('refuses points per army for a duel', () => {
    const state = reduceBattle([ALICE, BOB], [])
    expect(validate(state, ALICE, { ...configure(2000), armyPoints: [1000, 1000] })).toBe('only a team battle sets points per army')
  })
})

describe('battle size from each side’s lists', () => {
  const sides = (playerCount: 2 | 3 | 4, limit: number | null = null) =>
    ({ ...configure(limit), teamBattle: playerCount > 2, playerCount, sizeFromSides: true }) as Command
  const duel = (...commands: [string, Command][]) => reduceBattle([ALICE, BOB], log([ALICE, sides(2)], ...commands))
  const twoVsOne = (...commands: [string, Command][]) => reduceBattle([ALICE, BOB, CAROL], log([ALICE, sides(3)], ...commands), [0, 1, 1])
  const begin: Command = { kind: 'begin-battle', firstPlayerId: ALICE }

  it('lets the first list chosen set the size', () => {
    expect(duel([ALICE, army(1000)]).settings.limit).toBe(1000)
  })

  it('plays a duel at the bigger list’s size', () => {
    expect(duel([ALICE, army(1000)], [BOB, army(2000)]).settings.limit).toBe(2000)
  })

  it('starts a duel whose lists were built for different sizes', () => {
    expect(validate(duel([ALICE, army(1000)], [BOB, army(2000)]), ALICE, begin)).toBeNull()
  })

  it('says which side brings fewer points', () => {
    expect(shortSides(duel([ALICE, army(1000)], [BOB, army(2000)]))).toEqual([{ side: 0, points: 1000, against: 2000 }])
  })

  it('starts a duel whose lists bring different points budgets', () => {
    expect(validate(duel([ALICE, army(2000, undefined, 1500)], [BOB, army(2000)]), ALICE, begin)).toBeNull()
  })

  it('still refuses a list built bigger than a size the table chose', () => {
    const state = reduceBattle([ALICE, BOB], log([ALICE, sides(2, 1000)]))
    expect(validate(state, ALICE, army(2000))).toBe('that roster does not match the battle size')
  })

  it('adds a pair’s lists together', () => {
    expect(twoVsOne([ALICE, army(2000)], [BOB, army(1000)], [CAROL, army(1000)]).settings.limit).toBe(2000)
  })

  it('counts an ally who has not chosen at their partner’s list size', () => {
    expect(twoVsOne([BOB, army(1000)]).settings.limit).toBe(2000)
  })

  it('plays a doubles side at its lists added together', () => {
    const state = reduceBattle(
      [ALICE, BOB, CAROL, 'dave'],
      log([ALICE, sides(4)], [ALICE, army(1000)], [BOB, army(1000)], [CAROL, army(1000)], ['dave', army(1000)]),
      [0, 0, 1, 1],
    )
    expect(state.settings.limit).toBe(2000)
  })

  it('counts allies’ bigger lists only up to the points they share', () => {
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log([ALICE, sides(3, 2000)], [ALICE, army(2000)], [BOB, army(2000)], [CAROL, army(2000)]),
      [0, 1, 1],
    )
    expect(shortSides(state)).toEqual([])
  })

  it('finds no battle size for sides bigger than any', () => {
    expect(rosterBattleFormat(twoVsOne([BOB, army(2000)])).problem).toBe('unsupported')
  })
})

describe('2v1 points', () => {
  const twoVsOne = (playerCount: 3 | 4, ...commands: Command[]) =>
    reduceBattle(
      [ALICE, BOB, CAROL, ...(playerCount === 4 ? ['dave'] : [])],
      log(
        [ALICE, { ...configure(2000), teamBattle: true, playerCount }],
        ...commands.map((command) => [ALICE, command] as [string, Command]),
      ),
      playerCount === 4 ? [0, 0, 1, 1] : [0, 1, 1],
    )
  const spending = (playerId: string, units: number): Command => {
    const command = army(units > 10 ? 2000 : 1000, playerId)
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('Expected a built roster')
    const built = command.roster.built
    return {
      ...command,
      roster: {
        ...command.roster,
        built: { ...built, units: Array.from({ length: units }, (_, at) => ({ ...built.units[0]!, key: `u${at}` })) },
      },
    }
  }
  const begin: Command = { kind: 'begin-battle', firstPlayerId: ALICE }

  it('lets a pair split its side’s points however it agrees', () => {
    const state = twoVsOne(3, spending(ALICE, 20), spending(BOB, 11), spending(CAROL, 9))
    expect(validate(state, ALICE, begin)).toBeNull()
  })

  it('refuses a pair spending past its side’s points together', () => {
    const state = twoVsOne(3, spending(ALICE, 20), spending(BOB, 11), spending(CAROL, 10))
    expect(validate(state, ALICE, begin)).toBe('allies spend more than their 2,000 points')
  })

  it('names the pair’s shared points beside the battle size', () => {
    expect(battleSizeText(twoVsOne(3))).toBe('Strike Force · 2,000 vs 2,000 shared')
  })

  it('keeps each doubles army to half its side’s points', () => {
    const state = twoVsOne(4, spending(ALICE, 11), spending(BOB, 9), spending(CAROL, 10), spending('dave', 10))
    expect(validate(state, ALICE, begin)).toBe('an army spends more than its 1,000 points')
  })
})
