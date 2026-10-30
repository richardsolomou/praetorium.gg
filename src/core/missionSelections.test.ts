import { describe, expect, it } from 'vitest'
import { commandRefusal, reduceBattle, type Command, type LoggedCommand } from './battle'
import { ALICE, BOB, NAMES, PLAYERS, advance, attachedRoster, builtRoster, log, turns } from './battle.fixtures'
import { openMissionSelections, missionUnitCandidates, operationMarkers, savedMissionUnitStatus } from './missionSelections'
import { battleView } from './battleView'
import { appendLocalCommand, localBattleState, visibleBattleLog } from './offlineBattle'
import { commandSchema } from './commands'
import { battleReport } from './battleReport'

const primary = { key: 'punishment', name: 'Punishment', selection: 'punishment' as const }
const guard = { key: 'guards', name: 'Burden of Trust', selection: 'guards' as const }
const target = { key: 'target', name: 'A Tempting Target', selection: 'tempting-target' as const }
const beacon = { key: 'beacon', name: 'Beacon', selection: 'beacon' as const }

function history(extra: [string, Command][] = []): LoggedCommand[] {
  return log(
    [ALICE, builtRoster('Alice', ['Squad', 'Second squad'])],
    [BOB, attachedRoster()],
    [
      ALICE,
      {
        kind: 'set-prep',
        primary: { ...primary },
        secondaries: [],
        secondaryDeck: [{ ...guard }, { ...target }, { ...beacon }],
        secondaryMode: 'tactical',
        stratagems: [],
      },
    ],
    [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
    ...extra,
  )
}

const enemy = { playerId: BOB, unitKey: 'u0', rosterSeq: 2 }
const own = { playerId: ALICE, unitKey: 'u0', rosterSeq: 1 }
const condemn: Command = {
  kind: 'select-mission',
  cardKey: 'punishment',
  occurrence: 4,
  selection: { kind: 'punishment', units: [enemy], fallback: false, qualified: true },
}
const chooseBeacon: Command = {
  kind: 'select-mission',
  cardKey: beacon.key,
  occurrence: 5,
  selection: { kind: 'beacon', unit: own, note: 'Manual choice' },
}
const state = (...extra: [string, Command][]) => reduceBattle(PLAYERS, history(extra))

describe('source-backed mission selections', () => {
  it('asks for one start-of-turn nomination when the verified primary is prepared', () => {
    expect(openMissionSelections(state(), state().players[0]!)).toEqual([
      { cardKey: 'punishment', cardName: 'Punishment', kind: 'punishment', occurrence: 4, chooserSide: 0 },
    ])
  })

  it('refuses the opposing side choosing condemned units', () => {
    expect(commandRefusal(state(), BOB, { ...condemn, playerId: ALICE })?.code).toBe('mission-selection-owner')
  })

  it('refuses a friendly unit as a condemned enemy', () => {
    expect(
      commandRefusal(state(), ALICE, { ...condemn, selection: { kind: 'punishment', units: [own], fallback: false, qualified: true } })
        ?.code,
    ).toBe('mission-selection-unit')
  })

  it('refuses an unknown enemy unit key from the current roster', () => {
    expect(
      commandRefusal(state(), ALICE, {
        ...condemn,
        selection: { kind: 'punishment', units: [{ ...enemy, unitKey: 'missing' }], fallback: false, qualified: true },
      })?.code,
    ).toBe('mission-selection-unit')
  })

  it.each([
    ['punishment', 'strategic-reserves'],
    ['punishment', 'deep-strike'],
    ['punishment', 'embarked'],
    ['guards', 'strategic-reserves'],
    ['guards', 'deep-strike'],
    ['guards', 'embarked'],
  ] as const)('refuses a %s nomination for an attached unit in %s', (kind, formation) => {
    const army = attachedRoster({ marines: ['deep-strike'], lord: ['deep-strike'] })
    if (army.kind !== 'attach-roster' || !army.roster.built) throw new Error('expected built roster')
    army.roster.built.units.push({
      key: 'u2',
      name: 'Rhino',
      points: 100,
      models: 1,
      transport: true,
      transportRule: 'This model has a transport capacity of 12 INFANTRY models.',
    })
    let entries = history(kind === 'guards' ? [[ALICE, { kind: 'draw-secondary', secondary: guard }]] : [])
    entries[kind === 'guards' ? 0 : 1]!.command = army
    const players = NAMES.map((player, side) => ({ ...player, side, automated: false }))
    entries = appendLocalCommand(
      players,
      entries,
      kind === 'guards' ? ALICE : BOB,
      { kind: 'set-unit-formation', unitKey: 'u0', formation, ...(formation === 'embarked' ? { transportKey: 'u2' } : {}) },
      10,
    )
    const command: Command =
      kind === 'guards'
        ? {
            kind: 'select-mission',
            cardKey: guard.key,
            occurrence: 5,
            selection: { kind: 'guards', guards: [{ objective: { key: 'a', name: 'A' }, unit: own }] },
          }
        : condemn
    expect(commandRefusal(reduceBattle(PLAYERS, entries), ALICE, command)?.code).toBe('mission-selection-unit')
  })

  it('refuses a choice without confirmation of the table qualification', () => {
    expect(
      commandRefusal(state(), ALICE, { ...condemn, selection: { kind: 'punishment', units: [enemy], fallback: false, qualified: false } })
        ?.code,
    ).toBe('mission-selection-facts')
  })

  it('refuses a duplicate group counted as two nominations', () => {
    expect(
      commandRefusal(state(), ALICE, {
        ...condemn,
        selection: { kind: 'punishment', units: [enemy, enemy], fallback: false, qualified: true },
      })?.code,
    ).toBe('mission-selection-count')
  })

  it('refuses a component entry instead of the attached group identity', () => {
    expect(
      commandRefusal(state(), ALICE, {
        ...condemn,
        selection: { kind: 'punishment', units: [{ ...enemy, unitKey: 'u1' }], fallback: false, qualified: true },
      })?.code,
    ).toBe('mission-selection-unit')
  })

  it('keeps a nominated unit on the battlefield when only its bodyguard dies', () => {
    const battle = state([ALICE, condemn], [BOB, { kind: 'set-unit', unitKey: 'u0', destroyed: true }])
    expect(savedMissionUnitStatus(battle, battle.players[0]!.missionSelections[0]!.units[0]!)).toBe('battlefield')
  })

  it('keeps the original group available for selection after bodyguard death', () => {
    expect(
      missionUnitCandidates(state([BOB, { kind: 'set-unit', unitKey: 'u0', destroyed: true }]), 1).map((unit) => unit.unitKey),
    ).toEqual(['u0'])
  })

  it('marks a group destroyed only after both components are gone', () => {
    const battle = state(
      [ALICE, condemn],
      [BOB, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
      [BOB, { kind: 'set-unit', unitKey: 'u1', destroyed: true }],
    )
    expect(savedMissionUnitStatus(battle, battle.players[0]!.missionSelections[0]!.units[0]!)).toBe('destroyed')
  })

  it('does not migrate a nomination onto a replacement roster reusing the key', () => {
    const battle = state([ALICE, condemn], [BOB, builtRoster('Replacement', ['Different unit'])])
    expect(savedMissionUnitStatus(battle, battle.players[0]!.missionSelections[0]!.units[0]!)).toBe('replaced')
  })

  it('undoing roster replacement restores the original nominated group', () => {
    const battle = state([ALICE, condemn], [BOB, builtRoster('Replacement', ['Different unit'])], [ALICE, { kind: 'undo', target: 6 }])
    expect(savedMissionUnitStatus(battle, battle.players[0]!.missionSelections[0]!.units[0]!)).toBe('battlefield')
  })

  it('refuses a repeated nomination in the same turn', () => {
    expect(commandRefusal(state([ALICE, condemn]), ALICE, condemn)?.code).toBe('mission-selection-recorded')
  })

  it('permits no guards because guarding is optional', () => {
    const battle = state([ALICE, { kind: 'draw-secondary', secondary: guard }])
    expect(
      commandRefusal(battle, ALICE, {
        kind: 'select-mission',
        cardKey: guard.key,
        occurrence: 5,
        selection: { kind: 'guards', guards: [] },
      }),
    ).toBeNull()
  })

  it('permits one friendly unit to guard two different objectives', () => {
    const battle = state([ALICE, { kind: 'draw-secondary', secondary: guard }])
    expect(
      commandRefusal(battle, ALICE, {
        kind: 'select-mission',
        cardKey: guard.key,
        occurrence: 5,
        selection: {
          kind: 'guards',
          guards: [
            { objective: { key: 'a', name: 'A' }, unit: own },
            { objective: { key: 'b', name: 'B' }, unit: own },
          ],
        },
      }),
    ).toBeNull()
  })

  it('lets the opponent choose the tempting target', () => {
    const battle = state([ALICE, { kind: 'draw-secondary', secondary: target }])
    expect(
      commandRefusal(battle, BOB, {
        kind: 'select-mission',
        playerId: ALICE,
        cardKey: target.key,
        occurrence: 5,
        selection: { kind: 'tempting-target', objective: { key: 'c', name: 'Centre' } },
      }),
    ).toBeNull()
  })

  it('lets a practice player make the automated opponent’s tempting target choice', () => {
    const battle = reduceBattle(PLAYERS, history([[ALICE, { kind: 'draw-secondary', secondary: target }]]), undefined, [BOB])
    expect(
      commandRefusal(battle, ALICE, {
        kind: 'select-mission',
        playerId: ALICE,
        cardKey: target.key,
        occurrence: 5,
        selection: { kind: 'tempting-target', objective: { key: 'c', name: 'Centre' } },
      }),
    ).toBeNull()
  })

  it('does not invent compulsory selection work for old cards without source metadata', () => {
    const entries = history()
    const prep = entries[2]!.command
    if (prep.kind !== 'set-prep' || !prep.primary) throw new Error('expected prepared primary')
    delete prep.primary.selection
    const battle = reduceBattle(PLAYERS, entries)
    expect(openMissionSelections(battle, battle.players[0]!)).toEqual([])
  })

  it('offers a held Beacon as an open choice', () => {
    const battle = state([ALICE, { kind: 'draw-secondary', secondary: beacon }], [ALICE, condemn])
    expect(openMissionSelections(battle, battle.players[0]!).map((prompt) => prompt.kind)).toEqual(['beacon'])
  })

  it('freezes the selected group name and original membership in the saved flow', () => {
    expect(state([ALICE, condemn]).players[0]!.missionSelections[0]!.units).toEqual([
      { ...enemy, name: 'Plague Marines', memberKeys: ['u0', 'u1'] },
    ])
  })

  it.each([0, 2])('refuses %i fallback targets', (count) => {
    expect(
      commandRefusal(state(), ALICE, {
        ...condemn,
        selection: { kind: 'punishment', units: Array.from({ length: count }, () => enemy), fallback: true, qualified: true },
      })?.code,
    ).toBe('mission-selection-count')
  })

  it('accepts exactly three distinct qualified enemy groups', () => {
    const entries = history()
    entries[1]!.command = builtRoster('Enemy', ['First', 'Second', 'Third'])
    const battle = reduceBattle(PLAYERS, entries)
    expect(
      commandRefusal(battle, ALICE, {
        ...condemn,
        selection: {
          kind: 'punishment',
          units: [0, 1, 2].map((index) => ({ ...enemy, unitKey: `u${index}` })),
          fallback: false,
          qualified: true,
        },
      }),
    ).toBeNull()
  })

  it('refuses four otherwise valid enemy groups', () => {
    const entries = history()
    entries[1]!.command = builtRoster('Enemy', ['First', 'Second', 'Third', 'Fourth'])
    expect(
      commandRefusal(reduceBattle(PLAYERS, entries), ALICE, {
        ...condemn,
        selection: {
          kind: 'punishment',
          units: [0, 1, 2, 3].map((index) => ({ ...enemy, unitKey: `u${index}` })),
          fallback: false,
          qualified: true,
        },
      })?.code,
    ).toBe('mission-selection-count')
  })

  it('refuses a no-target record while an enemy group remains on the battlefield', () => {
    expect(
      commandRefusal(state(), ALICE, {
        ...condemn,
        selection: { kind: 'punishment', units: [], unavailable: true, fallback: false, qualified: false },
      })?.code,
    ).toBe('mission-selection-unit')
  })

  it('allows a no-target record once the entire enemy group is destroyed', () => {
    const battle = state(
      [BOB, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
      [BOB, { kind: 'set-unit', unitKey: 'u1', destroyed: true }],
    )
    expect(
      commandRefusal(battle, ALICE, {
        ...condemn,
        selection: { kind: 'punishment', units: [], unavailable: true, fallback: false, qualified: false },
      }),
    ).toBeNull()
  })

  it('refuses the original key after its roster is replaced', () => {
    expect(commandRefusal(state([BOB, builtRoster('Replacement', ['Different'])]), ALICE, condemn)?.code).toBe('mission-selection-unit')
  })

  it('refuses an old roster occurrence even for a manual Beacon using the same unit key', () => {
    const battle = state([ALICE, { kind: 'draw-secondary', secondary: beacon }], [ALICE, builtRoster('Replacement', ['Different'])])
    expect(commandRefusal(battle, ALICE, chooseBeacon)?.code).toBe('mission-selection-unit')
  })

  it('refuses a start-of-turn choice in the movement phase', () => {
    expect(commandRefusal(state([ALICE, { kind: 'advance' }]), ALICE, condemn)?.code).toBe('mission-selection-timing')
  })

  it('refuses a stale turn occurrence', () => {
    expect(commandRefusal(state(), ALICE, { ...condemn, occurrence: 3 })?.code).toBe('mission-selection-timing')
  })

  it('allows one guard per objective and refuses duplicate objective identities', () => {
    const battle = state([ALICE, { kind: 'draw-secondary', secondary: guard }])
    expect(
      commandRefusal(battle, ALICE, {
        kind: 'select-mission',
        cardKey: guard.key,
        occurrence: 5,
        selection: {
          kind: 'guards',
          guards: [
            { objective: { key: 'a', name: 'A' }, unit: own },
            { objective: { key: 'a', name: 'A again' }, unit: { ...own, unitKey: 'u1' } },
          ],
        },
      })?.code,
    ).toBe('mission-selection-objective')
  })

  it('bounds the core guard map when every objective and unit is otherwise valid', () => {
    expect(
      commandRefusal(state([ALICE, { kind: 'draw-secondary', secondary: guard }]), ALICE, {
        kind: 'select-mission',
        cardKey: guard.key,
        occurrence: 5,
        selection: {
          kind: 'guards',
          guards: Array.from({ length: 21 }, (_, index) => ({ objective: { key: `o-${index}`, name: `Objective ${index}` }, unit: own })),
        },
      })?.code,
    ).toBe('mission-selection-objective')
  })

  it('refuses the active side choosing its own tempting target', () => {
    const battle = state([ALICE, { kind: 'draw-secondary', secondary: target }])
    expect(
      commandRefusal(battle, ALICE, {
        kind: 'select-mission',
        cardKey: target.key,
        occurrence: 5,
        selection: { kind: 'tempting-target', objective: { key: 'c', name: 'Centre' } },
      })?.code,
    ).toBe('mission-selection-owner')
  })

  it.each(['request-advance', 'advance'] as const)('lets %s end the phase with choices unrecorded', (kind) => {
    const battle = state([ALICE, { kind: 'draw-secondaries', secondaries: [guard, target] }], [ALICE, { kind: 'acknowledge-draw' }])
    expect(commandRefusal(battle, ALICE, { kind })).toBeNull()
  })

  it('leaves the footer free of unrecorded choices', () => {
    const battle = state([ALICE, { kind: 'draw-secondaries', secondaries: [guard, target] }], [ALICE, { kind: 'acknowledge-draw' }])
    expect(battleView({ token: 'test' }, NAMES, battle, ALICE).advancePrompt).toBeNull()
  })

  it('keeps the draw requirement in the footer', () => {
    expect(battleView({ token: 'test' }, NAMES, state(), ALICE).advancePrompt).toBe('The active side has secondary missions to draw.')
  })

  it('keeps previous-turn settlement in the footer', () => {
    const battle = state([ALICE, condemn], ...turns(6, ALICE), ...turns(6, BOB))
    expect(battleView({ token: 'test' }, NAMES, battle, ALICE).advancePrompt).toBe('The previous turn is still to be settled.')
  })

  it('offers no nominations while the previous turn is still to be settled', () => {
    const battle = state([ALICE, condemn], ...turns(6, ALICE), ...turns(6, BOB))
    expect(battleView({ token: 'test' }, NAMES, battle, ALICE).missionChoices).toEqual([])
  })

  it('keeps secret handoff in the footer', () => {
    const battle = state([ALICE, condemn], [ALICE, { kind: 'select-secret', secondary: beacon }], ...turns(5, ALICE))
    expect(battleView({ token: 'test' }, NAMES, battle, ALICE).advancePrompt).toBe(
      'The active side has a secret mission to reveal or discard.',
    )
  })

  it('leaves the footer empty for an old prepared card without nomination capability', () => {
    const entries = history()
    const prep = entries[2]!.command
    if (prep.kind !== 'set-prep' || !prep.primary) throw new Error('expected prepared primary')
    delete prep.primary.selection
    prep.secondaryMode = 'fixed'
    expect(battleView({ token: 'test' }, NAMES, reduceBattle(PLAYERS, entries), ALICE).advancePrompt).toBeNull()
  })

  it('offers the opposing side its target choice without holding up the turn', () => {
    const battle = state(
      [ALICE, { kind: 'draw-secondaries', secondaries: [guard, target] }],
      [ALICE, { kind: 'acknowledge-draw' }],
      [ALICE, condemn],
      [ALICE, { kind: 'select-mission', cardKey: guard.key, occurrence: 5, selection: { kind: 'guards', guards: [] } }],
    )
    const view = battleView({ token: 'test' }, NAMES, battle, BOB)
    expect({
      message: view.advancePrompt,
      canChoose: view.missionChoices?.find((choice) => choice.kind === 'tempting-target')?.canChoose,
    }).toEqual({
      message: null,
      canChoose: true,
    })
  })

  it('does not offer a hidden mission’s choice to the opponent or spectator', () => {
    let entries = history()
    const prep = entries[2]!.command
    if (prep.kind !== 'set-prep' || !prep.primary) throw new Error('expected prepared primary')
    delete prep.primary.selection
    const players = NAMES.map((player, side) => ({ ...player, side, automated: false }))
    // Secret missions are refused now, but a battle that chose one before still folds it.
    entries = [
      ...entries,
      { seq: entries.length + 1, by: ALICE, command: { kind: 'select-secret', secondary: guard }, at: entries.at(-1)?.at ?? 0 },
    ]
    for (const command of [
      { kind: 'draw-secondaries', secondaries: [target, beacon] },
      { kind: 'acknowledge-draw' },
      { kind: 'set-secondary-status', key: target.key, status: 'discarded' },
    ] as Command[])
      entries = appendLocalCommand(players, entries, ALICE, command, entries.length)
    const battle = reduceBattle(PLAYERS, entries)
    expect(
      [ALICE, BOB, 'spectator'].map((viewer) =>
        battleView({ token: 'test' }, NAMES, battle, viewer).missionChoices?.some((choice) => choice.cardKey === guard.key),
      ),
    ).toEqual([true, false, false])
  })

  it('clears nomination work after saving each choice through the offline command flow', () => {
    const players = NAMES.map((player, side) => ({ ...player, side, automated: false }))
    let entries = history([
      [ALICE, { kind: 'draw-secondaries', secondaries: [guard, target] }],
      [ALICE, { kind: 'acknowledge-draw' }],
    ])
    for (const [by, command] of [
      [ALICE, condemn],
      [ALICE, { kind: 'select-mission', cardKey: guard.key, occurrence: 5, selection: { kind: 'guards', guards: [] } }],
      [
        BOB,
        {
          kind: 'select-mission',
          playerId: ALICE,
          cardKey: target.key,
          occurrence: 5,
          selection: { kind: 'tempting-target', objective: { key: 'c', name: 'Centre' } },
        },
      ],
    ] as [string, Command][])
      entries = appendLocalCommand(players, entries, by, command, 10)
    expect(battleView({ token: 'test' }, players, localBattleState(players, entries), ALICE).missionChoices).toEqual([])
  })

  it('undoing a saved choice makes that occurrence due again', () => {
    const battle = state([ALICE, condemn], [ALICE, { kind: 'undo', target: 5 }])
    expect(openMissionSelections(battle, battle.players[0]!).map((prompt) => prompt.cardKey)).toEqual(['punishment'])
  })

  it('expires condemned units only at the next start of the nominating side’s turn', () => {
    const first = state([ALICE, condemn], ...turns(6, ALICE))
    const next = state([ALICE, condemn], ...turns(6, ALICE), ...turns(6, BOB))
    expect([first.players[0]!.missionSelections[0]!.expired, next.players[0]!.missionSelections[0]!.expired]).toEqual([false, true])
  })

  it('plays a complete pair of turns before renewing condemnation and optional guards', () => {
    const players = NAMES.map((player, side) => ({ ...player, side, automated: false }))
    let entries = history([
      [ALICE, { kind: 'draw-secondaries', secondaries: [guard, target] }],
      [ALICE, { kind: 'acknowledge-draw' }],
      [ALICE, condemn],
      [ALICE, { kind: 'select-mission', cardKey: guard.key, occurrence: 5, selection: { kind: 'guards', guards: [] } }],
      [
        BOB,
        {
          kind: 'select-mission',
          playerId: ALICE,
          cardKey: target.key,
          occurrence: 5,
          selection: { kind: 'tempting-target', objective: { key: 'c', name: 'Centre' } },
        },
      ],
    ])
    const send = (by: string, command: Command) => {
      entries = appendLocalCommand(players, entries, by, command, entries.length)
    }
    for (const by of [ALICE, BOB]) {
      if (reduceBattle(PLAYERS, entries).pendingSettlement) send(by, { kind: 'settle-opponent-turn' })
      for (let phase = 0; phase < 6; phase++) {
        if (reduceBattle(PLAYERS, entries).phase === 'end') send(by, { kind: 'request-advance' })
        send(by, { kind: 'advance' })
      }
    }
    send(ALICE, { kind: 'settle-opponent-turn' })
    send(ALICE, { kind: 'draw-secondary', secondary: beacon })
    send(ALICE, { kind: 'acknowledge-draw' })
    const view = battleView({ token: 'test' }, players, localBattleState(players, entries), ALICE)
    expect({
      round: view.round,
      due: view.missionChoices?.filter((choice) => choice.kind !== 'beacon').map((choice) => choice.kind),
      old: view.players[0]!.missionSelections?.map((saved) => [saved.selection.kind, saved.expired]),
      points: view.players[0]!.total,
    }).toEqual({
      round: 2,
      due: ['punishment', 'guards'],
      old: [
        ['punishment', true],
        ['guards', true],
        ['tempting-target', false],
      ],
      points: 0,
    })
  })

  it('a returned model restores the same recorded group', () => {
    const battle = state(
      [ALICE, condemn],
      [BOB, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
      [BOB, { kind: 'set-unit', unitKey: 'u1', destroyed: true }],
      [BOB, { kind: 'set-unit', unitKey: 'u1', destroyed: false }],
    )
    expect(savedMissionUnitStatus(battle, battle.players[0]!.missionSelections[0]!.units[0]!)).toBe('battlefield')
  })

  it('locks a destroyed Beacon instead of offering a replacement', () => {
    const battle = state(
      [ALICE, { kind: 'draw-secondary', secondary: beacon }],
      [ALICE, chooseBeacon],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
    )
    expect(
      commandRefusal(battle, ALICE, { ...chooseBeacon, selection: { kind: 'beacon', unit: { ...own, unitKey: 'u1' }, note: '' } })?.code,
    ).toBe('mission-selection-recorded')
  })

  it('keeps the Beacon destruction lock after the original unit returns', () => {
    const battle = state(
      [ALICE, { kind: 'draw-secondary', secondary: beacon }],
      [ALICE, chooseBeacon],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: false }],
    )
    expect(commandRefusal(battle, ALICE, chooseBeacon)?.code).toBe('mission-selection-recorded')
  })

  it('restores Beacon corrections after undoing the destruction event', () => {
    const battle = state(
      [ALICE, { kind: 'draw-secondary', secondary: beacon }],
      [ALICE, chooseBeacon],
      [ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }],
      [ALICE, { kind: 'undo', target: 7 }],
    )
    expect(commandRefusal(battle, ALICE, chooseBeacon)).toBeNull()
  })

  it('hides private nomination payloads and notes in downloaded secret history', () => {
    const privateCard = { ...beacon, key: 'private-card', name: 'Private identity' }
    const entries = history([
      [ALICE, { kind: 'select-secret', secondary: privateCard }],
      [
        ALICE,
        {
          kind: 'select-mission',
          cardKey: privateCard.key,
          occurrence: 5,
          selection: { kind: 'beacon', unit: own, note: 'Private table note' },
        },
      ],
    ])
    const players = NAMES.map((player, side) => ({ ...player, side, automated: false }))
    expect(JSON.stringify(visibleBattleLog(players, entries, BOB))).not.toMatch(/Private identity|Private table note|rosterSeq/)
  })

  it('keeps historical nomination details hidden before a later secret reveal', () => {
    const secret = { ...beacon, key: 'secret-beacon', name: 'Hidden identity' }
    const entries = history([
      [ALICE, { kind: 'select-secret', secondary: secret }],
      [
        ALICE,
        { kind: 'select-mission', cardKey: secret.key, occurrence: 5, selection: { kind: 'beacon', unit: own, note: 'Hidden note' } },
      ],
      [ALICE, { kind: 'reveal-secret' }],
    ])
    const players = NAMES.map((player, side) => ({ ...player, side, automated: false }))
    const prefix = visibleBattleLog(players, entries, BOB).slice(0, 6)
    expect({
      records: battleView({ token: 'test' }, players, localBattleState(players, prefix), BOB).players[0]!.missionSelections,
      report: battleReport(NAMES, prefix, PLAYERS, BOB).at(-1)?.text,
    }).toEqual({ records: [], report: 'Alice records choices for a secret mission' })
  })

  it('round trips unit identity and independent table facts through stored JSON', () => {
    expect(commandSchema.parse(JSON.parse(JSON.stringify(condemn)))).toEqual(condemn)
  })

  it('bounds wire guard counts independently of their individual validity', () => {
    expect(
      commandSchema.safeParse({
        kind: 'select-mission',
        cardKey: guard.key,
        occurrence: 5,
        selection: {
          kind: 'guards',
          guards: Array.from({ length: 21 }, (_, index) => ({ objective: { key: `o-${index}`, name: `Objective ${index}` }, unit: own })),
        },
      }).success,
    ).toBe(false)
  })
})

const locate = { key: 'locate', name: 'Locate and Deny', selection: 'locate-and-deny' as const }
const relic = { key: 'relic', name: 'Extract Relic', selection: 'sensor-sweep' as const }
const consecrate = { key: 'consecrate', name: 'Consecrate', selection: 'consecrate' as const }
const prepare = (card: typeof locate | typeof relic | typeof consecrate): Command => ({
  kind: 'set-prep',
  primary: { ...card },
  secondaries: [],
  secondaryMode: 'fixed',
  stratagems: [],
})
const area = (key: string) => ({ key, name: `Ruin ${key.toUpperCase()}` })
type SelectionCommand = Extract<Command, { kind: 'select-mission' }>
const markers = (...keys: string[]): SelectionCommand => ({
  kind: 'select-mission',
  cardKey: locate.key,
  occurrence: 5,
  selection: { kind: 'locate-and-deny', areas: keys.map(area), outsideZone: true, allEligible: keys.length < 5 },
})
const sweep = (key: string, occurrence: number, cardKey = relic.key): SelectionCommand => ({
  kind: 'select-mission',
  cardKey,
  occurrence,
  selection: { kind: 'sensor-sweep', marker: { playerId: ALICE, ...area(key) }, controlled: true },
})

/** Alice plays Locate and Deny against Bob's Extract Relic, and Bob takes the first turn. */
const locateBattle = (...extra: [string, Command][]) =>
  reduceBattle(
    PLAYERS,
    log(
      [ALICE, builtRoster('Alice', ['Squad'])],
      [BOB, builtRoster('Bob', ['Squad'])],
      [ALICE, prepare(locate)],
      [BOB, prepare(relic)],
      [ALICE, { kind: 'begin-battle', firstPlayerId: BOB }],
      ...extra,
    ),
  )

describe('Locate and Deny operation markers', () => {
  it('asks the Locate and Deny side for its markers at the start of the battle when the opponent takes the first turn', () => {
    expect(openMissionSelections(locateBattle(), locateBattle().players[0]!)).toEqual([
      { cardKey: locate.key, cardName: locate.name, kind: 'locate-and-deny', occurrence: 5, chooserSide: 0 },
    ])
  })

  it('lets the first turn leave its Command phase before the markers are placed', () => {
    expect(commandRefusal(locateBattle(), BOB, { kind: 'advance' })).toBeNull()
  })

  it('refuses the opposing side placing Locate and Deny markers', () => {
    expect(commandRefusal(locateBattle(), BOB, { ...markers('a', 'b', 'c', 'd', 'e'), playerId: ALICE })?.code).toBe(
      'mission-selection-owner',
    )
  })

  it('accepts five distinct terrain areas outside the deployment zone', () => {
    expect(commandRefusal(locateBattle(), ALICE, markers('a', 'b', 'c', 'd', 'e'))).toBeNull()
  })

  it('refuses fewer than five areas without confirming that no other area is eligible', () => {
    const command = markers('a', 'b')
    if (command.selection.kind !== 'locate-and-deny') throw new Error('expected markers')
    command.selection.allEligible = false
    expect(commandRefusal(locateBattle(), ALICE, command)?.code).toBe('mission-selection-count')
  })

  it('accepts fewer than five areas when they are every terrain area outside the deployment zone', () => {
    expect(commandRefusal(locateBattle(), ALICE, markers('a', 'b'))).toBeNull()
  })

  it('records no markers when no terrain area lies outside the deployment zone', () => {
    expect(commandRefusal(locateBattle(), ALICE, markers())).toBeNull()
  })

  it('refuses six terrain areas', () => {
    expect(commandRefusal(locateBattle(), ALICE, markers('a', 'b', 'c', 'd', 'e', 'f'))?.code).toBe('mission-selection-objective')
  })

  it('bounds the wire marker count', () => {
    expect(commandSchema.safeParse(markers('a', 'b', 'c', 'd', 'e', 'f')).success).toBe(false)
  })

  it('refuses two markers in one terrain area', () => {
    expect(commandRefusal(locateBattle(), ALICE, markers('a', 'a', 'b', 'c', 'd'))?.code).toBe('mission-selection-objective')
  })

  it('requires confirmation that each terrain area is outside the deployment zone', () => {
    const command = markers('a', 'b', 'c', 'd', 'e')
    if (command.selection.kind !== 'locate-and-deny') throw new Error('expected markers')
    command.selection.outsideZone = false
    expect(commandRefusal(locateBattle(), ALICE, command)?.code).toBe('mission-selection-facts')
  })

  it('refuses placing the markers again; undo makes them due again', () => {
    const placed = locateBattle([ALICE, markers('a', 'b', 'c', 'd', 'e')])
    const undone = locateBattle([ALICE, markers('a', 'b', 'c', 'd', 'e')], [ALICE, { kind: 'undo', target: 6 }])
    expect({
      repeated: commandRefusal(placed, ALICE, markers('a', 'b', 'c', 'd', 'e'))?.code,
      due: openMissionSelections(undone, undone.players[0]!).map((prompt) => prompt.kind),
    }).toEqual({ repeated: 'mission-selection-recorded', due: ['locate-and-deny'] })
  })

  it('does not ask for markers again after the opening turn', () => {
    const battle = locateBattle([ALICE, markers('a', 'b', 'c', 'd', 'e')], ...turns(6, BOB))
    expect(openMissionSelections(battle, battle.players[0]!)).toEqual([])
  })
})

describe('Sensor Sweep', () => {
  const swept = (...extra: [string, Command][]) => locateBattle([ALICE, markers('a', 'b', 'c')], ...turns(5, BOB), ...extra)

  it('offers the Extract Relic side a sweep at the end of its turn', () => {
    const view = battleView({ token: 'test' }, NAMES, swept(), BOB)
    expect(view.missionChoices?.map((choice) => [choice.kind, choice.canChoose, choice.markers?.map((marker) => marker.key)])).toEqual([
      ['sensor-sweep', true, ['a', 'b', 'c']],
    ])
  })

  it('removes the chosen opposing marker', () => {
    const battle = swept([BOB, sweep('a', 5)])
    expect(operationMarkers(battle).map((marker) => [marker.key, marker.removedRound])).toEqual([
      ['a', 1],
      ['b', null],
      ['c', null],
    ])
  })

  it('keeps the opening markers when the opening turn ends with a sweep of the same turn', () => {
    const entries = log(
      [ALICE, builtRoster('Alice', ['Squad'])],
      [BOB, builtRoster('Bob', ['Squad'])],
      [ALICE, prepare(locate)],
      [BOB, prepare(relic)],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [ALICE, markers('a', 'b', 'c')],
      ...turns(5, ALICE),
      [ALICE, sweep('a', 5, locate.key)],
    )
    expect(
      reduceBattle(PLAYERS, entries).players[0]!.missionSelections.map((saved) => [saved.selection.kind, saved.removedMarkers]),
    ).toEqual([
      ['locate-and-deny', { a: 1 }],
      ['sensor-sweep', undefined],
    ])
  })

  it('refuses a sweep before the end of the turn', () => {
    expect(commandRefusal(locateBattle([ALICE, markers('a', 'b', 'c')], ...turns(2, BOB)), BOB, sweep('a', 5))?.code).toBe(
      'mission-selection-timing',
    )
  })

  it('refuses a second sweep in the same turn', () => {
    expect(commandRefusal(swept([BOB, sweep('a', 5)]), BOB, sweep('b', 5))?.code).toBe('mission-selection-recorded')
  })

  it('requires confirmation that the sweeping unit controls its objective', () => {
    const command = sweep('a', 5)
    if (command.selection.kind !== 'sensor-sweep') throw new Error('expected sweep')
    command.selection.controlled = false
    expect(commandRefusal(swept(), BOB, command)?.code).toBe('mission-selection-facts')
  })

  it('lets the Locate and Deny side sweep its own markers on its turn', () => {
    const battle = swept([BOB, sweep('a', 5)], [BOB, advance()], ...turns(5, ALICE))
    expect(commandRefusal(battle, ALICE, sweep('b', 13, locate.key))).toBeNull()
  })

  it('refuses removing a marker already removed', () => {
    const battle = swept([BOB, sweep('a', 5)], [BOB, advance()], ...turns(5, ALICE))
    expect(commandRefusal(battle, ALICE, sweep('a', 13, locate.key))?.code).toBe('mission-selection-objective')
  })

  it('refuses a sweep once only one operation marker remains', () => {
    const battle = locateBattle([ALICE, markers('a', 'b')], ...turns(5, BOB), [BOB, sweep('a', 5)], [BOB, advance()], ...turns(5, ALICE))
    expect(commandRefusal(battle, ALICE, sweep('b', 13, locate.key))?.code).toBe('mission-selection-count')
  })

  it('withdraws the sweep once only one operation marker remains', () => {
    const battle = locateBattle([ALICE, markers('a', 'b')], ...turns(5, BOB), [BOB, sweep('a', 5)], [BOB, advance()], ...turns(5, ALICE))
    expect(battleView({ token: 'test' }, NAMES, battle, ALICE).missionChoices).toEqual([])
  })

  it('undoing a sweep restores the marker', () => {
    const battle = swept([BOB, sweep('a', 5)], [BOB, { kind: 'undo', target: 12 }])
    expect(operationMarkers(battle).every((marker) => marker.removedRound === null)).toBe(true)
  })

  it('refuses a sweep from a mission without the action', () => {
    const entries = log(
      [ALICE, builtRoster('Alice', ['Squad'])],
      [BOB, builtRoster('Bob', ['Squad'])],
      [ALICE, prepare(locate)],
      [BOB, prepare(consecrate)],
      [ALICE, { kind: 'begin-battle', firstPlayerId: BOB }],
      [ALICE, markers('a', 'b', 'c')],
      ...turns(5, BOB),
    )
    expect(commandRefusal(reduceBattle(PLAYERS, entries), BOB, sweep('a', 5, consecrate.key))?.code).toBe('mission-selection-invalid')
  })

  it('shows removed markers to a spectator', () => {
    const view = battleView({ token: 'test' }, NAMES, swept([BOB, sweep('a', 5)]), 'spectator')
    expect(view.players[0]!.missionSelections?.[0]?.removedMarkers).toEqual({ a: 1 })
  })

  it('round trips the marker identity through stored JSON', () => {
    const command = sweep('a', 5)
    expect(commandSchema.parse(JSON.parse(JSON.stringify(command)))).toEqual(command)
  })
})

describe('Consecrate', () => {
  const objective = (key: string) => ({ key, name: `Objective ${key}` })
  const allies = (unitKey: string) => ({ playerId: ALICE, unitKey, rosterSeq: 1 })
  const consecration = (entries: [string, string][], occurrence = 4): SelectionCommand => ({
    kind: 'select-mission',
    cardKey: consecrate.key,
    occurrence,
    selection: {
      kind: 'consecrate',
      consecrations: entries.map(([key, unitKey]) => ({ objective: objective(key), unit: allies(unitKey) })),
      qualified: true,
      notHome: true,
    },
  })
  const consecrateBattle = (...extra: [string, Command][]) =>
    reduceBattle(
      PLAYERS,
      log(
        [ALICE, builtRoster('Alice', ['Squad', 'Second squad'])],
        [BOB, attachedRoster()],
        [ALICE, prepare(consecrate)],
        [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
        ...extra,
      ),
    )
  const atEnd = (...extra: [string, Command][]) => consecrateBattle(...turns(5, ALICE), ...extra)

  it('does not ask for consecrations at the start of the turn', () => {
    expect(openMissionSelections(consecrateBattle(), consecrateBattle().players[0]!)).toEqual([])
  })

  it('asks for consecrations at the end of the own turn', () => {
    expect(openMissionSelections(atEnd(), atEnd().players[0]!)).toEqual([
      { cardKey: consecrate.key, cardName: consecrate.name, kind: 'consecrate', occurrence: 4, chooserSide: 0 },
    ])
  })

  it.each(['request-advance', 'advance'] as const)('lets %s end the turn with consecrations unrecorded', (kind) => {
    expect(commandRefusal(atEnd(), ALICE, { kind })).toBeNull()
  })

  it('permits recording no consecration because it is optional', () => {
    expect(commandRefusal(atEnd(), ALICE, consecration([]))).toBeNull()
  })

  it('accepts two consecration units consecrating two objectives', () => {
    expect(
      commandRefusal(
        atEnd(),
        ALICE,
        consecration([
          ['a', 'u0'],
          ['b', 'u1'],
        ]),
      ),
    ).toBeNull()
  })

  it('refuses one consecration unit consecrating two objectives', () => {
    expect(
      commandRefusal(
        atEnd(),
        ALICE,
        consecration([
          ['a', 'u0'],
          ['b', 'u0'],
        ]),
      )?.code,
    ).toBe('mission-selection-count')
  })

  it('refuses consecrating one objective twice in one turn', () => {
    expect(
      commandRefusal(
        atEnd(),
        ALICE,
        consecration([
          ['a', 'u0'],
          ['a', 'u1'],
        ]),
      )?.code,
    ).toBe('mission-selection-objective')
  })

  it('refuses an objective consecrated in an earlier turn', () => {
    const battle = atEnd([ALICE, consecration([['a', 'u0']])], [ALICE, advance()], ...turns(6, BOB), ...turns(5, ALICE))
    expect(commandRefusal(battle, ALICE, consecration([['a', 'u1']], 17))?.code).toBe('mission-selection-objective')
  })

  it('leaves already consecrated objectives out of the choice', () => {
    const battle = atEnd([ALICE, consecration([['a', 'u0']])], [ALICE, advance()], ...turns(6, BOB), ...turns(5, ALICE))
    expect(battleView({ token: 'test' }, NAMES, battle, ALICE).missionChoices?.[0]?.consecrated).toEqual([objective('a')])
  })

  it('keeps consecrated objectives after the next own turn begins', () => {
    const battle = atEnd([ALICE, consecration([['a', 'u0']])], [ALICE, advance()], ...turns(6, BOB))
    expect(battle.players[0]!.missionSelections[0]!.expired).toBe(false)
  })

  it('refuses an enemy unit as a consecration unit', () => {
    const command = consecration([['a', 'u0']])
    if (command.selection.kind !== 'consecrate') throw new Error('expected consecration')
    command.selection.consecrations[0]!.unit = { playerId: BOB, unitKey: 'u0', rosterSeq: 2 }
    expect(commandRefusal(atEnd(), ALICE, command)?.code).toBe('mission-selection-unit')
  })

  it('refuses a destroyed consecration unit', () => {
    expect(
      commandRefusal(atEnd([ALICE, { kind: 'set-unit', unitKey: 'u0', destroyed: true }]), ALICE, consecration([['a', 'u0']]))?.code,
    ).toBe('mission-selection-unit')
  })

  it.each(['qualified', 'notHome'] as const)('requires the independent %s table fact when consecrating', (missing) => {
    const command = consecration([['a', 'u0']])
    if (command.selection.kind !== 'consecrate') throw new Error('expected consecration')
    command.selection[missing] = false
    expect(commandRefusal(atEnd(), ALICE, command)?.code).toBe('mission-selection-facts')
  })

  it('refuses the opposing side recording consecrations', () => {
    expect(commandRefusal(atEnd(), BOB, { ...consecration([]), playerId: ALICE })?.code).toBe('mission-selection-owner')
  })

  it('refuses a repeated record; undo makes it due again', () => {
    const recorded = atEnd([ALICE, consecration([])])
    const undone = atEnd([ALICE, consecration([])], [ALICE, { kind: 'undo', target: 10 }])
    expect({
      repeated: commandRefusal(recorded, ALICE, consecration([]))?.code,
      due: openMissionSelections(undone, undone.players[0]!).map((prompt) => prompt.kind),
    }).toEqual({ repeated: 'mission-selection-recorded', due: ['consecrate'] })
  })

  it('shows consecrations to the opponent', () => {
    const view = battleView({ token: 'test' }, NAMES, atEnd([ALICE, consecration([['a', 'u0']])]), BOB)
    expect(view.players[0]!.missionSelections?.map((saved) => saved.units.map((unit) => unit.name))).toEqual([['Squad']])
  })
})
