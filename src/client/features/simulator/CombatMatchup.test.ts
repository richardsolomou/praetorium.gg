import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { CombatAnswer, CombatantSnapshot } from '../../../core/combatMatchup'
import { CombatMatchup, combatOutcomeEvent } from './CombatMatchup'

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

it('calculates zero-attack phases when no weapons are equipped', () => {
  const markup = renderToStaticMarkup(createElement(CombatMatchup, { attacker: unit, defender: unit }))
  expect([...markup.matchAll(/aria-label="(?:Shooting|Melee) results" aria-busy="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'true',
    'true',
  ])
})

it('does not promise a calculation against unsupported defensive characteristics', () => {
  const defender = {
    ...unit,
    sheet: {
      ...unit.sheet,
      profiles: unit.sheet.profiles.map((profile) => ({
        ...profile,
        values: profile.values.map((value) => (value.name === 'T' ? { ...value, value: '?' } : value)),
      })),
    },
  }
  const markup = renderToStaticMarkup(createElement(CombatMatchup, { attacker: unit, defender }))
  expect([...markup.matchAll(/aria-label="(?:Shooting|Melee) results" aria-busy="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'false',
    'false',
  ])
})
