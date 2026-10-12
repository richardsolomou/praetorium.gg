import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { reduceBattle, type Command } from '../../../core/battle'
import { ALICE, BOB, NAMES, PLAYERS, builtRoster, log } from '../../../core/battle.fixtures'
import { battleView } from '../../../core/battleView'
import { MissionSelectionRecords } from './MissionSelectionRecord'

function savedGuards(count: number) {
  const card = { key: 'guards', name: 'Burden of Trust', selection: 'guards' as const }
  const battle = reduceBattle(
    PLAYERS,
    log(
      [ALICE, builtRoster('Friendly', ['Squad'])],
      [BOB, builtRoster('Enemy', ['Squad'])],
      [ALICE, { kind: 'set-prep', primary: null, secondaries: [], secondaryDeck: [card], stratagems: [], secondaryMode: 'tactical' }],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      [ALICE, { kind: 'draw-secondary', secondary: card }],
      [
        ALICE,
        {
          kind: 'select-mission',
          cardKey: card.key,
          occurrence: 5,
          selection: {
            kind: 'guards',
            guards: Array.from({ length: count }, (_, index) => ({
              objective: { key: `objective-${index}`, name: `Objective ${index}` },
              unit: { playerId: ALICE, rosterSeq: 1, unitKey: 'u0' },
            })),
          },
        },
      ],
    ),
  )
  return battleView({ token: 'test' }, NAMES, battle, ALICE).players[0]!.missionSelections ?? []
}

it.each([0, 1, 2])('prints %i guard nominations through the saved command flow', (count) => {
  const records = savedGuards(count)
  expect(renderToStaticMarkup(createElement(MissionSelectionRecords, { records, cardKey: 'guards' }))).toContain(
    `${count} guard ${count === 1 ? 'nomination' : 'nominations'}`,
  )
})

it('names a shared guard once for each chosen objective without repeating a unit list', () => {
  const markup = renderToStaticMarkup(createElement(MissionSelectionRecords, { records: savedGuards(2), cardKey: 'guards' }))
  expect(markup.match(/Squad/g)).toHaveLength(2)
})

function savedPrimary(card: { key: string; name: string; selection: 'locate-and-deny' | 'consecrate' }, extra: [string, Command][]) {
  const battle = reduceBattle(
    PLAYERS,
    log(
      [ALICE, builtRoster('Friendly', ['Squad', 'Second squad'])],
      [BOB, builtRoster('Enemy', ['Squad'])],
      [ALICE, { kind: 'set-prep', primary: card, secondaries: [], stratagems: [], secondaryMode: 'fixed' }],
      [ALICE, { kind: 'begin-battle', firstPlayerId: ALICE }],
      ...extra,
    ),
  )
  return renderToStaticMarkup(
    createElement(MissionSelectionRecords, {
      records: battleView({ token: 'test' }, NAMES, battle, ALICE).players[0]!.missionSelections ?? [],
      cardKey: card.key,
    }),
  )
}

const locate = { key: 'locate', name: 'Locate and Deny', selection: 'locate-and-deny' as const }
const placed = (count: number): [string, Command] => [
  ALICE,
  {
    kind: 'select-mission',
    cardKey: locate.key,
    occurrence: 4,
    selection: {
      kind: 'locate-and-deny',
      areas: Array.from({ length: count }, (_, index) => ({ key: `area-${index}`, name: `Ruin ${index}` })),
      outsideZone: count > 0,
      allEligible: count < 5,
    },
  },
]

it.each([
  [0, '0 operation markers'],
  [1, '1 operation marker'],
  [5, '5 operation markers'],
])('counts %i placed Locate and Deny markers through the saved command flow', (count, label) => {
  expect(savedPrimary(locate, [placed(count)])).toContain(label)
})

it('marks a swept marker with the round it was removed', () => {
  const markup = savedPrimary(locate, [
    placed(3),
    ...Array.from({ length: 5 }, (): [string, Command] => [ALICE, { kind: 'advance' }]),
    [
      ALICE,
      {
        kind: 'select-mission',
        cardKey: locate.key,
        occurrence: 4,
        selection: { kind: 'sensor-sweep', marker: { playerId: ALICE, key: 'area-1', name: 'Ruin 1' }, controlled: true },
      },
    ],
  ])
  expect(markup).toContain('Ruin 1<span class="text-faint"> (removed R1)</span>')
})

const consecrate = { key: 'consecrate', name: 'Consecrate', selection: 'consecrate' as const }

it.each([
  [0, '0 consecrated objectives'],
  [1, '1 consecrated objective'],
  [2, '2 consecrated objectives'],
])('counts %i consecrated objectives through the saved command flow', (count, label) => {
  expect(
    savedPrimary(consecrate, [
      ...Array.from({ length: 5 }, (): [string, Command] => [ALICE, { kind: 'advance' }]),
      [
        ALICE,
        {
          kind: 'select-mission',
          cardKey: consecrate.key,
          occurrence: 4,
          selection: {
            kind: 'consecrate',
            consecrations: Array.from({ length: count }, (_, index) => ({
              objective: { key: `objective-${index}`, name: `Objective ${index}` },
              unit: { playerId: ALICE, rosterSeq: 1, unitKey: `u${index}` },
            })),
            qualified: count > 0,
            notHome: count > 0,
          },
        },
      ],
    ]),
  ).toContain(label)
})
