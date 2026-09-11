import { describe, expect, it } from 'vitest'
import {
  borrowedDispositionError,
  type Command,
  optionalRules,
  pickedOptionalRules,
  GAME_SIZES,
  isKotcLimit,
  detachmentLimit,
  detachmentPointsError,
  formatDatasheetLimit,
  formatRules,
  kotcUnitExclusions,
  waivedFormatRules,
  reduceBattle,
  sideDisposition,
  sideDispositionChoices,
  validate,
} from './battle'
import { battleView } from './battleView'
import { ALICE, BOB, CAROL, NAMES, PLAYERS, advance, builtRoster, log, roster, started } from './battle.fixtures'

describe('setup', () => {
  const fourSeatState = (sides: number[], rosterLimits: number[] = [1_000, 1_000, 1_000, 1_000]) => {
    const ids = [ALICE, BOB, CAROL, 'dave']
    const configured: Command = {
      kind: 'configure-battle',
      limit: 2_000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: true,
      playerCount: 4,
      clockLimitMinutes: null,
    }
    const list = (playerId: string, limit: number): Command => ({
      kind: 'attach-roster',
      playerId,
      roster: {
        name: `${playerId} army`,
        text: 'units',
        built: { catalogueId: 'cat', revision: 'rev', limit, detachment: null, disposition: null, units: [] },
      },
    })
    return reduceBattle(
      ids,
      log([ALICE, configured], ...ids.map((id, index) => [ALICE, list(id, rosterLimits[index]!)] as [string, Command])),
      sides,
    )
  }

  it('requires two armies on each side of a four-seat battle and half-size rosters', () => {
    const state = fourSeatState([0, 0, 1, 1])

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBeNull()
  })

  it('refuses a four-seat battle seated three against one', () => {
    const state = fourSeatState([0, 0, 0, 1])

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('players must be seated on two valid sides')
  })

  it('refuses to configure fewer seats than are already occupied', () => {
    const state = reduceBattle([ALICE, BOB, CAROL, 'dave'], log(), [0, 0, 1, 1])

    expect(
      validate(state, ALICE, {
        kind: 'configure-battle',
        limit: 2_000,
        missionPackId: null,
        terrainLayoutId: null,
        twistId: null,
        teamBattle: true,
        playerCount: 3,
        clockLimitMinutes: null,
      }),
    ).toBe('choose enough seats for every player')
  })

  it('refuses to begin when four occupied seats are configured for three players', () => {
    const state = fourSeatState([0, 0, 1, 1])
    state.settings.playerCount = 3

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('too many players are seated')
  })

  it('refuses a three-seat battle unless its sides contain one and two players', () => {
    const state = reduceBattle([ALICE, BOB, CAROL], log(), [0, 1, 2])
    state.settings = { ...state.settings, teamBattle: true, playerCount: 3 }

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('players must be seated on two valid sides')
  })

  it('refuses a four-seat battle with a roster at the full force size', () => {
    const state = fourSeatState([0, 0, 1, 1], [1_000, 1_000, 1_000, 2_000])

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('every roster must match the battle size')
  })

  it('keeps a legacy team-battle command at three seats', () => {
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log([
        ALICE,
        {
          kind: 'configure-battle',
          limit: 2_000,
          missionPackId: null,
          terrainLayoutId: null,
          twistId: null,
          teamBattle: true,
          clockLimitMinutes: null,
        },
      ]),
      [0, 1, 1],
    )

    expect(state.settings.playerCount).toBe(3)
  })
  const leagueBattle = () =>
    reduceBattle(
      PLAYERS,
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 2000,
            missionPackId: null,
            terrainLayoutId: null,
            twistId: null,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, builtRoster('Alice army', ['Intercessors'])],
        [BOB, builtRoster('Bob army', ['Plague Marines'])],
        [ALICE, { kind: 'lock-league-rosters', leagueToken: 'league' }],
      ),
    )

  it('shares the league that sealed the battle rosters', () => {
    expect(battleView({ token: 'league-battle' }, NAMES, leagueBattle(), ALICE).leagueToken).toBe('league')
  })

  it('refuses to replace a sealed league roster', () => {
    expect(validate(leagueBattle(), ALICE, builtRoster('Replacement', ['Terminators']))).toBe('league rosters are sealed')
  })

  it('refuses to remove a sealed league roster', () => {
    expect(validate(leagueBattle(), ALICE, { kind: 'detach-roster' })).toBe('league rosters are sealed')
  })

  it('refuses to reset sealed league rosters', () => {
    expect(validate(leagueBattle(), ALICE, { kind: 'reset-setup' })).toBe('league rosters are sealed')
  })

  it('refuses to change a sealed league battle size', () => {
    expect(
      validate(leagueBattle(), ALICE, {
        kind: 'configure-battle',
        limit: 1000,
        missionPackId: null,
        terrainLayoutId: null,
        twistId: null,
        clockLimitMinutes: null,
      }),
    ).toBe('league roster battle size is sealed')
  })

  it('refuses to add another side to a sealed league battle', () => {
    expect(
      validate(leagueBattle(), ALICE, {
        kind: 'configure-battle',
        limit: 2000,
        missionPackId: null,
        terrainLayoutId: null,
        twistId: null,
        teamBattle: true,
        clockLimitMinutes: null,
      }),
    ).toBe('league battle sides are sealed')
  })

  it('shares the current setup section with every player', () => {
    const state = reduceBattle(PLAYERS, log([BOB, { kind: 'set-setup-step', step: 2 }]))

    expect(battleView({ token: 'shared-step' }, NAMES, state, ALICE).setupStep).toBe(2)
  })

  it('records deployment order before the first-turn roll-off', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, roster('Alice army')],
        [BOB, roster('Bob army')],
        [BOB, { kind: 'set-attacker', attackerId: BOB }],
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ),
    )

    expect(state).toMatchObject({ attackerId: BOB, firstPlayerId: ALICE, activePlayerId: ALICE })
  })

  it('clears deployment order when setup is reset', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, { kind: 'set-attacker', attackerId: BOB }], [ALICE, { kind: 'reset-setup' }]))
    expect(state.attackerId).toBeNull()
  })

  it('shares the first-turn roll-off with every device before the battle begins', () => {
    const state = reduceBattle(PLAYERS, log([BOB, { kind: 'set-first-turn', firstPlayerId: BOB }]))

    // Recorded a section before the battle starts, so the seat that presses start is
    // not necessarily the seat that watched the dice.
    expect(battleView({ token: 'roll-off' }, NAMES, state, ALICE).firstPlayerId).toBe(BOB)
    expect(state.status).toBe('setup')
  })

  it('clears the first-turn roll-off when setup is reset', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, { kind: 'set-first-turn', firstPlayerId: BOB }], [ALICE, { kind: 'reset-setup' }]))
    expect(state.firstPlayerId).toBeNull()
  })

  it('rejects a first turn for someone who is not seated', () => {
    expect(validate(reduceBattle(PLAYERS, log()), ALICE, { kind: 'set-first-turn', firstPlayerId: CAROL })).toBe(
      'that player is not in this battle',
    )
  })

  it('takes an army back off the table', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, builtRoster('Alice army', ['Bloat-drone'])], [ALICE, { kind: 'detach-roster' }]))

    expect(state.players[0]).toMatchObject({ roster: null, units: [] })
    // Nothing may be started without it, which is the point of being able to take it back.
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('both armies need a list')
  })

  it('refuses to take back a seat that has no army', () => {
    expect(validate(reduceBattle(PLAYERS, log()), ALICE, { kind: 'detach-roster' })).toBe('that seat has no army')
  })

  it('rejects an attacker who is not seated', () => {
    expect(validate(reduceBattle(PLAYERS, log()), ALICE, { kind: 'set-attacker', attackerId: CAROL })).toBe(
      'that attacker is not in this battle',
    )
  })

  it('lets allies share one turn in a 2v1 battle', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log(
        [ALICE, configure],
        [ALICE, roster('Knights')],
        [BOB, roster('Marines')],
        [CAROL, roster('Guard')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: BOB }],
      ),
      [0, 1, 1],
    )

    expect(validate(state, CAROL, advance())).toBeNull()
  })

  /**
   * A side of allies fields one army between them, so the pack's 10 VP is the side's
   * and not each list's — and an unpainted half costs the side all of it.
   */
  it('pays an allied side one battle-ready bonus, and only when both armies earn it', () => {
    const teamBattle: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const seats = [ALICE, BOB, CAROL]
    const sideOfEach = [0, 1, 1]
    const both = log(
      [ALICE, teamBattle],
      [ALICE, roster('Knights')],
      [BOB, roster('Marines')],
      [CAROL, roster('Guard')],
      [BOB, { kind: 'set-painted', painted: true }],
      [CAROL, { kind: 'set-painted', painted: true }],
    )
    const one = [...both, { seq: both.length + 1, by: CAROL, at: both.length, command: { kind: 'set-painted', painted: false } as Command }]

    const paid = battleView({ token: 'painted' }, NAMES, reduceBattle(seats, both, sideOfEach), BOB)
    const short = battleView({ token: 'painted' }, NAMES, reduceBattle(seats, one, sideOfEach), BOB)

    expect(paid.players.filter((player) => player.side === 1).map((player) => player.paintedPoints)).toEqual([10, 10])
    expect(short.players.filter((player) => player.side === 1).map((player) => player.paintedPoints)).toEqual([0, 0])
  })

  /**
   * A side fields one army between them, so it plays one Force Disposition. Two allies
   * who wrote down different cards are asked which; nothing picks one for them.
   */
  it('asks an allied side which force disposition it plays, and refuses one nobody brought', () => {
    const teamBattle: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    // The solo side brings the whole battle size; the allied pair splits it.
    const army = (name: string, disposition: string, limit: number): Command => ({
      kind: 'attach-roster',
      roster: {
        name,
        text: name,
        built: { catalogueId: 'cat', revision: 'rev', limit, detachment: null, disposition, units: [] },
      },
    })
    const seats = [ALICE, BOB, CAROL]
    const sideOfEach = [0, 1, 1]
    const disagreeing = log(
      [ALICE, teamBattle],
      [ALICE, army('Knights', 'take-and-hold', 2000)],
      [BOB, army('Marines', 'recon', 1000)],
      [CAROL, army('Guard', 'purge-the-foe', 1000)],
    )

    const undecided = reduceBattle(seats, disagreeing, sideOfEach)
    expect(sideDisposition(undecided, 1)).toBeNull()
    expect(sideDispositionChoices(undecided, 1)).toEqual(['recon', 'purge-the-foe'])
    // The side across the table brought one card, so there is nothing to settle there.
    expect(sideDisposition(undecided, 0)).toBe('take-and-hold')
    expect(validate(undecided, BOB, { kind: 'set-side-disposition', side: 1, disposition: 'take-and-hold' })).toBe(
      'that force disposition is not one this side brought',
    )

    const settled = reduceBattle(
      seats,
      [
        ...disagreeing,
        { seq: disagreeing.length + 1, by: CAROL, at: 4, command: { kind: 'set-side-disposition', side: 1, disposition: 'purge-the-foe' } },
      ],
      sideOfEach,
    )
    expect(sideDisposition(settled, 1)).toBe('purge-the-foe')
    expect(battleView({ token: 'disposition' }, NAMES, settled, BOB).players[1]?.disposition).toBe('purge-the-foe')

    // Nothing starts on an unanswered question, because the answer decides the mission.
    expect(validate(undecided, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe(
      'each side must choose the force disposition it plays',
    )
    expect(validate(settled, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBeNull()

    // A battle begun before the question was asked keeps the card it was being played
    // on, rather than losing its mission and every cap with it.
    const begun = reduceBattle(
      seats,
      [...disagreeing, { seq: disagreeing.length + 1, by: ALICE, at: 4, command: { kind: 'begin-battle', firstPlayerId: ALICE } }],
      sideOfEach,
    )
    expect(begun.status).toBe('playing')
    expect(sideDisposition(begun, 1)).toBe('recon')
  })

  it('shares allied command points while keeping their rosters separate', () => {
    const configure: Command = {
      kind: 'configure-battle',
      limit: 2000,
      missionPackId: null,
      terrainLayoutId: null,
      twistId: null,
      teamBattle: true,
      clockLimitMinutes: null,
    }
    const state = reduceBattle(
      [ALICE, BOB, CAROL],
      log(
        [ALICE, configure],
        [ALICE, roster('Knights')],
        [BOB, roster('Marines')],
        [CAROL, roster('Guard')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: BOB }],
        [CAROL, { kind: 'adjust-cp', delta: 1 }],
      ),
      [0, 1, 1],
    )
    const view = battleView({ token: 'team' }, [...NAMES, { id: CAROL, name: 'Carol' }], state, CAROL)

    expect(view.players.map((player) => ({ name: player.roster?.name, cp: player.cp }))).toEqual([
      { name: 'Knights', cp: 1 },
      { name: 'Marines', cp: 2 },
      { name: 'Guard', cp: 2 },
    ])
    expect(validate(state, BOB, { kind: 'adjust-cp', delta: 1 })).toBe(
      'a side can gain at most 1 additional command point per battle round',
    )
  })

  it('limits King of the Colosseum to one detachment', () => {
    expect(detachmentLimit(500)).toBe(1)
    expect(detachmentLimit(600)).toBe(1)
    expect(detachmentLimit(2000)).toBe(3)
  })

  it('applies King of the Colosseum datasheet caps', () => {
    expect(formatDatasheetLimit(500, false)).toBe(1)
    expect(formatDatasheetLimit(500, true)).toBe(2)
    expect(formatDatasheetLimit(600, false)).toBe(1)
    expect(formatDatasheetLimit(600, true)).toBe(2)
    expect(formatDatasheetLimit(2000, false)).toBeNull()
  })

  it('offers King of the Colosseum at 600 points only', () => {
    expect(GAME_SIZES.filter((size) => size.name.startsWith('King of the Colosseum')).map((size) => size.limit)).toEqual([600])
  })

  it('keeps playing a roster saved at a size no longer offered', () => {
    expect(isKotcLimit(500)).toBe(true)
  })

  it('lets a King of the Colosseum roster borrow a disposition its leftover points cover', () => {
    expect(borrowedDispositionError(600, ['kotc-borrowed-disposition'], { points: 1 }, { points: 2 })).toBeNull()
  })

  it('refuses a borrowed disposition the roster cannot pay for', () => {
    expect(borrowedDispositionError(600, ['kotc-borrowed-disposition'], { points: 2 }, { points: 2 })).toBe(
      'This combination costs 4 DP; the borrowed disposition rule allows 3 DP.',
    )
  })

  it('refuses a borrowed disposition the catalogue cannot price', () => {
    expect(borrowedDispositionError(600, ['kotc-borrowed-disposition'], { points: null }, { points: 2 })).toBe(
      'One of these detachments has no points value, so the borrowed disposition cannot be paid for.',
    )
  })

  it('offers the borrowed disposition optional rule only at King of the Colosseum', () => {
    expect(borrowedDispositionError(2000, ['kotc-borrowed-disposition'], { points: 1 }, { points: 1 })).toBe(
      'Only a King of the Colosseum roster may borrow another detachment\u2019s Force Disposition.',
    )
  })

  it('charges nothing to a roster that borrows no disposition', () => {
    expect(borrowedDispositionError(600, ['kotc-borrowed-disposition'], { points: 3 }, null)).toBeNull()
  })

  it('refuses a borrow the roster never picked the optional rule for', () => {
    expect(borrowedDispositionError(600, [], { points: 1 }, { points: 1 })).toBe(
      'This roster is not playing the borrowed disposition optional rule.',
    )
  })

  it('offers homebrew only at the sizes that have any', () => {
    expect(optionalRules(600).map((rule) => rule.id)).toEqual(['kotc-borrowed-disposition'])
    expect(optionalRules(2000)).toEqual([])
    expect(optionalRules(null)).toEqual([])
  })

  it('counts only the homebrew its own battle size offers', () => {
    expect(pickedOptionalRules(600, ['kotc-borrowed-disposition']).map((rule) => rule.label)).toEqual(['Borrowed disposition'])
    expect(pickedOptionalRules(600, [])).toEqual([])
    // The id is kept when a list moves to a size that does not offer it, so moving back
    // restores the choice — but nothing here is being played with it.
    expect(pickedOptionalRules(2000, ['kotc-borrowed-disposition'])).toEqual([])
  })

  it('names the restrictions each battle size adds', () => {
    expect(formatRules(600).map((rule) => rule.id)).toEqual([
      'detachments',
      'kotc-infantry',
      'kotc-warlord',
      'kotc-epic-heroes',
      'kotc-toughness',
      'kotc-datasheet-copies',
    ])
    expect(formatRules(2000).map((rule) => rule.id)).toEqual(['detachment-points'])
    expect(formatRules(3000)).toEqual([])
    expect(formatRules(null)).toEqual([])
  })

  it('counts only the waivers its own battle size imposes', () => {
    expect(waivedFormatRules(600, ['kotc-epic-heroes']).map((rule) => rule.label)).toEqual(['No Epic Heroes'])
    // The id is kept when a list moves to a size that does not impose it, so moving
    // back restores the choice — but nothing here is being played without.
    expect(waivedFormatRules(2000, ['kotc-epic-heroes'])).toEqual([])
    expect(waivedFormatRules(2000, ['detachment-points']).map((rule) => rule.id)).toEqual(['detachment-points'])
    expect(waivedFormatRules(null, ['kotc-epic-heroes'])).toEqual([])
  })

  it('stops applying a restriction the roster has waived', () => {
    const epicHero = { keywords: ['Infantry', 'Epic Hero'], toughness: 12 }
    expect(kotcUnitExclusions(epicHero)).toEqual(['does not allow Epic Heroes', 'does not allow Toughness 12'])
    expect(kotcUnitExclusions(epicHero, ['kotc-epic-heroes'])).toEqual(['does not allow Toughness 12'])
    expect(kotcUnitExclusions(epicHero, ['kotc-epic-heroes', 'kotc-toughness'])).toEqual([])
    expect(detachmentLimit(600, ['detachments'])).toBe(3)
    expect(formatDatasheetLimit(600, true, ['kotc-datasheet-copies'])).toBeNull()
    expect(detachmentPointsError([{ points: 3 }, { points: 3 }], 3)).toBe(
      'This combination costs 6 DP; multiple detachments at this battle size may cost at most 3 DP.',
    )
    expect(detachmentPointsError([{ points: 3 }, { points: 3 }], 3, ['detachment-points'])).toBeNull()
  })

  it('has no active player before the battle begins', () => {
    expect(reduceBattle(PLAYERS, log()).activePlayerId).toBeNull()
  })

  it('refuses to begin until both armies have a list', () => {
    const state = reduceBattle(PLAYERS, log([ALICE, roster('Ultramarines')]))
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('both armies need a list')
  })

  it('allows correcting a list once the battle has begun', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, BOB, roster('Death Guard'))).toBeNull()
  })

  it('refuses a change of cards once the battle has begun', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    const prep: Command = { kind: 'set-prep', stratagems: [], secondaries: [], primary: null, secondaryMode: 'fixed' }
    expect(validate(state, ALICE, prep)).toBe('cards are settled before the battle begins')
  })

  it('refuses duplicate selected secondaries', () => {
    const state = reduceBattle(PLAYERS, log())
    const secondary = { key: 'secondary', name: 'Behind Enemy Lines' }
    const prep: Command = {
      kind: 'set-prep',
      stratagems: [],
      secondaries: [secondary, secondary],
      primary: null,
      secondaryMode: 'fixed',
    }

    expect(validate(state, ALICE, prep)).toBe('the selected secondaries contain duplicates')
  })

  it('allows a missing tactical deck to be restored after the battle begins', () => {
    const stratagem = { key: 'reroll', name: 'Command Re-roll', cp: 1, limit: 'phase' as const }
    const repair: Command = {
      kind: 'set-prep',
      stratagems: [stratagem],
      secondaries: [],
      secondaryDeck: [{ key: 'a', name: 'Behind Enemy Lines' }],
      primary: { key: 'primary', name: 'Battlefield Dominance' },
      secondaryMode: 'tactical',
    }
    const prep: Command = { ...repair, secondaryDeck: undefined }
    const history: [string, Command][] = [
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [ALICE, prep],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    ]
    const missing = reduceBattle(PLAYERS, log(...history))
    const restored = reduceBattle(PLAYERS, log(...history, [ALICE, repair]))

    expect(validate(missing, ALICE, repair)).toBeNull()
    expect(validate(missing, ALICE, { ...repair, stratagems: [] })).toBe('cards are settled before the battle begins')
    expect(restored.players[0]?.stratagems).toEqual([stratagem])
    expect(validate(restored, ALICE, repair)).toBe('cards are settled before the battle begins')
  })

  it('restores a legacy fixed deck without changing the selected cards', () => {
    const selected = { key: 'a', name: 'Behind Enemy Lines' }
    const secret = { key: 'b', name: 'Assassination' }
    const primary = { key: 'primary', name: 'Battlefield Dominance' }
    const fixedPrep: Command = {
      kind: 'set-prep',
      stratagems: [],
      secondaries: [selected],
      primary: null,
      secondaryMode: 'fixed',
    }
    const history: [string, Command][] = [
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [ALICE, fixedPrep],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    ]
    const missing = reduceBattle(PLAYERS, log(...history))
    const repair: Command = { ...fixedPrep, primary, secondaryDeck: [selected, secret] }

    expect(validate(missing, ALICE, fixedPrep)).toBe('cards are settled before the battle begins')
    expect(validate(missing, ALICE, repair)).toBeNull()
    const restored = reduceBattle(PLAYERS, log(...history, [ALICE, repair]))
    expect(battleView({ token: 'abc' }, NAMES, restored, ALICE).players[0]?.remainingSecondaries).toEqual([secret])
    expect(restored.players[0]?.primaryCard).toEqual(primary)
    expect(validate(missing, ALICE, { ...repair, secondaries: [secret] })).toBe('cards are settled before the battle begins')
  })

  it('restores a fixed deck without resetting a selected secret or settled score', () => {
    const fixed = { key: 'fixed', name: 'Behind Enemy Lines' }
    const secret = { key: 'secret', name: 'Hold the Line' }
    const prep: Command = { kind: 'set-prep', stratagems: [], secondaries: [fixed], primary: null, secondaryMode: 'fixed' }
    const history: [string, Command][] = [
      [ALICE, roster('Ultramarines')],
      [BOB, roster('Death Guard')],
      [ALICE, prep],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [ALICE, { kind: 'select-secret', secondary: secret }],
      [ALICE, { kind: 'score-secondary', key: fixed.key, delta: 4 }],
      [ALICE, { kind: 'set-secondary-status', key: fixed.key, status: 'discarded' }],
    ]
    const missing = reduceBattle(PLAYERS, log(...history))
    const repair: Command = { ...prep, secondaryDeck: [fixed, secret] }
    const restored = reduceBattle(PLAYERS, log(...history, [ALICE, repair]))

    expect(validate(missing, ALICE, repair)).toBeNull()
    expect(restored.players[0]).toMatchObject({
      secondaries: [fixed, secret],
      secondaryStatus: { fixed: 'discarded', secret: 'active' },
      secretSecondary: secret.key,
      secretRevealed: false,
      scored: { fixed: 4 },
    })
  })

  it('refuses cards carried in with a replacement list', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    const command: Command = {
      kind: 'attach-roster',
      roster: { name: 'Death Guard', text: '10 Plague Marines' },
      prep: { stratagems: [], secondaries: [], primary: null, secondaryMode: 'fixed' },
    }
    expect(validate(state, BOB, command)).toBe('cards are settled before the battle begins')
  })

  it('keeps legacy logs with a non-default roster size startable', () => {
    const alice = builtRoster('Incursion army', ['Intercessors'])
    if (alice.kind !== 'attach-roster' || !alice.roster.built) throw new Error('expected a built roster')
    alice.roster.built.limit = 1000
    const state = reduceBattle(PLAYERS, log([ALICE, alice], [BOB, roster('Death Guard')]))
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBeNull()
  })

  it('requires attached rosters to match an explicitly configured size', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 1000,
            missionPackId: null,
            terrainLayoutId: null,
            twistId: null,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, builtRoster('Strike force', ['Intercessors'])],
        [BOB, roster('Death Guard')],
      ),
    )
    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('every roster must match the battle size')
  })

  it('refuses a replacement roster at the wrong configured size', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 1000,
            missionPackId: null,
            terrainLayoutId: null,
            twistId: null,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, roster('Incursion army')],
        [BOB, roster('Death Guard')],
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ),
    )
    expect(validate(state, ALICE, builtRoster('Strike force', ['Intercessors']))).toBe('that roster does not match the battle size')
  })

  it('refuses multiple detachments over the battle-size allowance', () => {
    const command = builtRoster('Necrons', ['Immortals'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.detachments = [
      { name: 'Cryptek Conclave', points: 2 },
      { name: 'Hand of the Dynasty', points: 1 },
    ]
    command.roster.built.detachmentPointBudget = 2

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBe('invalid detachment combination')
  })

  it('allows one detachment above the multi-detachment allowance', () => {
    const command = builtRoster('Necrons', ['Immortals'])
    if (command.kind !== 'attach-roster' || !command.roster.built) throw new Error('expected a built roster')
    command.roster.built.detachments = [{ name: 'Hand of the Dynasty', points: 3 }]
    command.roster.built.detachmentPointBudget = 2

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBeNull()
  })

  it('validates tactical prep attached with a roster', () => {
    const command: Command = {
      kind: 'attach-roster',
      roster: { name: 'Necrons', text: '10 Immortals' },
      prep: { stratagems: [], secondaries: [], primary: null, secondaryMode: 'tactical' },
    }

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBe('choose a tactical secondary deck')
  })

  it('refuses duplicate cards in prep attached with a roster', () => {
    const card = { key: 'a', name: 'Behind Enemy Lines' }
    const command: Command = {
      kind: 'attach-roster',
      roster: { name: 'Necrons', text: '10 Immortals' },
      prep: { stratagems: [], secondaries: [card], secondaryDeck: [card, card], primary: null, secondaryMode: 'tactical' },
    }

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBe('the secondary deck contains duplicates')
  })

  it('refuses selected cards outside prep attached with a roster', () => {
    const command: Command = {
      kind: 'attach-roster',
      roster: { name: 'Necrons', text: '10 Immortals' },
      prep: {
        stratagems: [],
        secondaries: [{ key: 'b', name: 'Bring It Down' }],
        secondaryDeck: [{ key: 'a', name: 'Behind Enemy Lines' }],
        primary: null,
        secondaryMode: 'tactical',
      },
    }

    expect(validate(reduceBattle(PLAYERS, log()), ALICE, command)).toBe('a selected secondary is not in the deck')
  })

  it('refuses to start a battle with only one seat filled', () => {
    const state = reduceBattle([ALICE], log([ALICE, roster('Practice army')]))

    expect(validate(state, ALICE, { kind: 'begin-battle', firstPlayerId: ALICE })).toBe('waiting for an opponent')
  })

  it('resets a setup draft without deleting its history', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, roster('Ultramarines')],
        [ALICE, { kind: 'set-deployment', patternId: 'sweeping-engagement' }],
        [ALICE, { kind: 'reset-setup' }],
      ),
    )

    expect(state.players.every((player) => player.roster === null)).toBe(true)
    expect(state.deploymentId).toBeNull()
  })

  it('keeps the configured format when setup is reset', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 1000,
            missionPackId: 'chapter-approved',
            terrainLayoutId: 'layout-a',
            twistId: 'twist-a',
            clockLimitMinutes: 45,
          },
        ],
        [ALICE, { kind: 'reset-setup' }],
      ),
    )

    expect(state.settings).toEqual({
      limit: 1000,
      missionPackId: 'chapter-approved',
      terrainLayoutId: null,
      twistId: null,
      teamBattle: false,
      playerCount: 2,
    })
  })

  it('clears deployment and terrain when a setup roster changes', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        [ALICE, { kind: 'set-deployment', patternId: 'tipping-point' }],
        [
          ALICE,
          {
            kind: 'configure-battle',
            limit: 2000,
            missionPackId: null,
            terrainLayoutId: 'layout-a',
            twistId: null,
            clockLimitMinutes: null,
          },
        ],
        [ALICE, roster('Ultramarines')],
      ),
    )

    expect(state).toMatchObject({ deploymentId: null, settings: { terrainLayoutId: null } })
  })

  it('reconciles saved prep when a roster is replaced', () => {
    const replacement = roster('Corrected roster')
    if (replacement.kind !== 'attach-roster') throw new Error('expected an attached roster')
    replacement.prep = {
      stratagems: [{ key: 'new', name: 'New Order', cp: 1, limit: 'turn' }],
      secondaries: [{ key: 'new-card', name: 'New Card' }],
      primary: null,
      secondaryMode: 'fixed',
    }
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [{ key: 'old', name: 'Old Order', cp: 1, limit: 'turn' }],
            secondaries: [{ key: 'old-card', name: 'Old Card' }],
            primary: null,
            secondaryMode: 'fixed',
          },
        ],
        [ALICE, replacement],
      ),
    )

    expect(state.players[0]).toMatchObject({ stratagems: [{ key: 'new' }], secondaries: [{ key: 'new-card' }] })
  })

  it('keeps prep when replaying a legacy roster replacement without prep data', () => {
    const state = reduceBattle(
      PLAYERS,
      log(
        ...started(),
        [
          ALICE,
          {
            kind: 'set-prep',
            stratagems: [{ key: 'old', name: 'Old Order', cp: 1, limit: 'turn' }],
            secondaries: [{ key: 'old-card', name: 'Old Card' }],
            primary: null,
            secondaryMode: 'fixed',
          },
        ],
        [ALICE, roster('Legacy corrected roster')],
      ),
    )

    expect(state.players[0]).toMatchObject({ stratagems: [{ key: 'old' }], secondaries: [{ key: 'old-card' }] })
  })

  it('allows replacing your roster after play starts', () => {
    const state = reduceBattle(PLAYERS, log(...started()))
    expect(validate(state, ALICE, roster('Corrected roster'))).toBeNull()
  })
})
