import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CombatMatchup, combatOutcomeEvent, type CombatAnswer, type CombatantSnapshot } from './CombatMatchup'

it('records a partial estimate as a completion with its available phase', () => {
  const answer = { ranged: { result: {} }, melee: { error: 'unsupported weapon details' } } as CombatAnswer
  expect(combatOutcomeEvent(answer, 'roster')).toEqual({
    name: 'combat_simulation_completed',
    properties: { source: 'roster', shooting: true, melee: false },
  })
})

it('records a failed estimate without its error message', () => {
  const answer: CombatAnswer = { ranged: { error: 'weapon details' }, melee: { error: 'target details' } }
  expect(combatOutcomeEvent(answer, 'battle')).toEqual({
    name: 'combat_simulation_failed',
    properties: { source: 'battle', reason: 'calculation' },
  })
})

it('does not report an estimate when neither phase was requested', () => {
  expect(combatOutcomeEvent({ ranged: null, melee: null }, 'standalone')).toBeNull()
})

it('does not promise an ongoing calculation when neither phase can be simulated', () => {
  const unit: CombatantSnapshot = {
    models: 1,
    carriers: [],
    sheet: {
      id: 'unit',
      slug: 'unit',
      name: 'Unit',
      referenceRoute: null,
      points: null,
      keywords: [],
      profiles: [
        {
          id: 'model',
          name: 'Model',
          type: 'Unit',
          values: [
            { name: 'T', value: '4' },
            { name: 'Sv', value: '3+' },
            { name: 'W', value: '2' },
          ],
        },
      ],
      abilities: [],
      composition: [],
      loadout: null,
      wargearOptions: [],
      baseSize: null,
      transport: null,
      costs: [],
      attachments: [],
      leaders: [],
      supporters: [],
      keywordRules: [],
    },
  }
  const markup = renderToStaticMarkup(createElement(CombatMatchup, { attacker: unit, defender: unit }))
  expect([...markup.matchAll(/aria-label="(?:Shooting|Melee) results" aria-busy="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'false',
    'false',
  ])
})
