import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { reduceBattle } from '../../../core/battle'
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
