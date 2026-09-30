import { expect, it } from 'vitest'
import { bookOf, card, points, withCards } from './catalogue.fixtures'
import { priceOf } from './catalogueUnit'
import { calculateRosterAssessment, calculateRosterPrice, calculateRosterTotals } from './pricing'
import { unitPointAdjustment } from './unitPoints'

const loaded = bookOf({
  selectionEntries: [
    {
      id: 'lion',
      name: "Lion El'Jonson",
      type: 'model',
      costs: points(265),
      selectionEntries: [
        {
          id: 'relic',
          name: 'Relic',
          type: 'upgrade',
          costs: points(20),
          constraints: [{ id: 'relic-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
        },
      ],
    },
    { id: 'ally', name: 'Ally', type: 'model', costs: points(100) },
  ],
})
loaded.factionContents.set(
  'test-catalogue',
  withCards(
    'Test catalogue',
    new Map([
      ["Lion El'Jonson", card({ points: [{ models: '1', cost: '415', keyword: null, faction: null, detachment: null }] })],
      ['Ally', card({ points: [{ models: '1', cost: '100', keyword: null, faction: null, detachment: null }] })],
    ]),
  ),
)
const input = {
  catalogueId: 'cat',
  detachmentIds: [],
  disposition: null,
  limit: 2_000,
  units: [{ entryId: 'lion' }, { entryId: 'ally' }],
}

it('uses the current card row in the picker, roster, assessment, and total', () => {
  const priced = calculateRosterPrice(input, loaded, null)
  const assessed = calculateRosterAssessment(input, loaded, null)
  const total = calculateRosterTotals(input, loaded, null)

  expect({
    picker: priceOf(loaded, 'cat', 'lion'),
    unit: priced?.units[0]?.points,
    roster: priced?.points,
    assessment: assessed?.points,
    total: total?.points,
  }).toEqual({
    picker: 415,
    unit: 415,
    roster: 515,
    assessment: 515,
    total: 515,
  })
})

it('keeps the catalogue price when the card row is conditional', () => {
  const conditional = bookOf({ selectionEntries: [{ id: 'lion', name: "Lion El'Jonson", type: 'model', costs: points(265) }] })
  conditional.factionContents.set(
    'test-catalogue',
    withCards(
      'Test catalogue',
      new Map([["Lion El'Jonson", card({ points: [{ models: '1', cost: '415', keyword: 'Primarch', faction: null, detachment: null }] })]]),
    ),
  )

  expect(unitPointAdjustment(conditional, 'cat', 'cat', 'lion', 1)).toBe(0)
})

it('keeps the catalogue price when the card prints two prices for one model count', () => {
  const ambiguous = bookOf({ selectionEntries: [{ id: 'lion', name: "Lion El'Jonson", type: 'model', costs: points(265) }] })
  ambiguous.factionContents.set(
    'test-catalogue',
    withCards(
      'Test catalogue',
      new Map([
        [
          "Lion El'Jonson",
          card({
            points: [
              { models: '1', cost: '265', keyword: null, faction: null, detachment: null },
              { models: '1', cost: '415', keyword: null, faction: null, detachment: null },
            ],
          }),
        ],
      ]),
    ),
  )

  expect(unitPointAdjustment(ambiguous, 'cat', 'cat', 'lion', 1)).toBe(0)
})

it('retains the price of selected catalogue upgrades above the card price', () => {
  const priced = calculateRosterPrice({ ...input, units: [{ entryId: 'lion', choices: { relic: 'relic' } }] }, loaded, null)

  expect({ unit: priced?.units[0]?.points, roster: priced?.points }).toEqual({ unit: 435, roster: 435 })
})
