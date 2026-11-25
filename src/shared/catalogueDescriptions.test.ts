import { expect, it } from 'vitest'
import { mergeDetachmentRules } from './catalogueDescriptions'

it('adds no rule of the catalogue’s own that the rules version marks absent under the Detachment', () => {
  const catalogueRules = [
    { name: 'Armoured Wrath', description: 'wrath' },
    { name: 'Ironstorm Auto-targeters', description: 'targeters' },
  ]
  const cards = [{ name: 'Ironstorm Auto-targeters', description: 'card' }]
  expect([
    mergeDetachmentRules(catalogueRules, cards, ['armoured-wrath']).map((rule) => rule.name),
    mergeDetachmentRules(catalogueRules, cards).map((rule) => rule.name),
  ]).toEqual([['Ironstorm Auto-targeters'], ['Ironstorm Auto-targeters', 'Armoured Wrath']])
})
