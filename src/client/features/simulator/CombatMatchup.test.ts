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

const slots = { attackerControl: null, defenderControl: null, attackerBuffs: null, defenderBuffs: null, invalidAttachments: {} }

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
  const markup = renderToStaticMarkup(
    createElement(CombatMatchup, { attacker: unit, defender: unit, preferences: {}, onPreferencesChange: () => {}, ...slots }),
  )
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
  const markup = renderToStaticMarkup(
    createElement(CombatMatchup, { attacker: unit, defender, preferences: {}, onPreferencesChange: () => {}, ...slots }),
  )
  expect([...markup.matchAll(/aria-label="(?:Shooting|Melee) results" aria-busy="([^"]+)"/g)].map((match) => match[1])).toEqual([
    'false',
    'false',
  ])
})

it('includes evaluated companion profile sources in the visible calculation summary', () => {
  const companion = {
    ...unit,
    sheet: {
      ...unit.sheet,
      profiles: unit.sheet.profiles.map((profile) => ({
        ...profile,
        values: profile.values.map((value) => ({ ...value, modifiers: ['Companion equipment'] })),
      })),
    },
  }
  const markup = renderToStaticMarkup(
    createElement(CombatMatchup, {
      attacker: { ...unit, companions: [companion] },
      defender: unit,
      preferences: {},
      onPreferencesChange: () => {},
      ...slots,
    }),
  )
  expect(markup.slice(markup.indexOf('aria-label="Applied modifiers"'))).toContain('Profile changes: Companion equipment.')
})

it('separates sourced re-rolls from explicit manual adjustments in the calculation summary', () => {
  const attacker: CombatantSnapshot = {
    ...unit,
    rules: [{ name: 'Source re-roll', effects: [{ role: 'attacker', phases: ['ranged'], options: { woundReroll: 'ones' } }] }],
  }
  const markup = renderToStaticMarkup(
    createElement(CombatMatchup, {
      attacker,
      defender: unit,
      preferences: {},
      onPreferencesChange: () => {},
      ...slots,
      initialSettings: { adjustments: { all: { hitModifier: 1 } }, preferences: {}, excluded: { ranged: [], melee: [] }, allocation: [] },
    }),
  )
  expect(markup.slice(markup.indexOf('aria-label="Applied modifiers"'))).toContain(
    '<li>Attacker rules: Source re-roll</li><li>No defender rules</li><li>Re-roll wound 1s from rules</li><li>Manual: +1 to hit (All)</li>',
  )
})

it('explains when equipment invalidates a previously selected weapon profile', () => {
  const markup = renderToStaticMarkup(
    createElement(CombatMatchup, {
      attacker: unit,
      defender: unit,
      preferences: {},
      onPreferencesChange: () => {},
      ...slots,
      invalidatedPreferences: true,
    }),
  )
  expect(markup).toContain('Some previous weapon choices no longer apply to this equipment. Current profiles are used.')
})
