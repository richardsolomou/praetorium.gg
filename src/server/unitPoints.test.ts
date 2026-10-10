import { expect, it } from 'vitest'
import { evaluate } from '../core/evaluate'
import { buildUnit } from '../core/roster'
import { bookOf, card, points, withCards } from './catalogue.fixtures'
import { priceOf } from '../shared/catalogueUnit'
import { calculateRosterAssessment, calculateRosterPrice, calculateRosterTotals, savedRosterPriceInput } from '../shared/pricing'
import { unitPointAdjustment } from '../shared/unitPoints'
import { mfmWargearOptionPoints } from './mfm'

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

it('prices first, second, and third copies from MFM without retaining BSData copy surcharges', () => {
  const catalogue = bookOf({
    selectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'model',
        costs: points(100),
        modifiers: [
          {
            field: 'cost-pts',
            type: 'increment',
            value: 10,
            conditionGroups: [
              {
                type: 'and',
                localConditionGroups: [
                  {
                    field: 'selections',
                    includeChildForces: true,
                    includeChildSelections: true,
                    repeats: 1,
                    scope: 'parent',
                    type: 'atLeast',
                    value: 2,
                    conditions: [
                      { childId: 'any', field: 'selections', scope: 'self', shared: true, type: 'before', value: 1 },
                      { childId: 'squad', field: 'selections', scope: 'self', shared: true, type: 'instanceOf', value: 1 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
  catalogue.factionContents.set(
    'test-catalogue',
    withCards(
      'Test catalogue',
      new Map([['Squad', card({ points: [{ models: '1', cost: '100', keyword: null, faction: null, detachment: null }] })]]),
    ),
  )
  catalogue.mfm = new Map([
    [
      'test-catalogue',
      {
        slug: 'test-catalogue',
        version: '1.5',
        units: [
          {
            name: 'Squad',
            pricing: [
              { range: '[1,2]', costs: [{ models: 1, points: 90 }] },
              { range: '[3,)', costs: [{ models: 1, points: 105 }] },
            ],
          },
        ],
      },
    ],
  ])
  const saved = {
    catalogueId: 'cat',
    detachmentIds: [],
    disposition: null,
    limit: 2_000,
    picks: [{ entryId: 'squad' }, { entryId: 'squad' }, { entryId: 'squad' }],
  }
  const baseline = buildUnit('squad', catalogue.index)!.selection
  expect(evaluate([baseline, baseline, baseline], catalogue.index).selectionPoints[0]).toEqual([100, 100, 110])
  const pricedInput = savedRosterPriceInput(saved)
  expect({
    picker: priceOf(catalogue, 'cat', 'squad'),
    units: calculateRosterPrice(pricedInput, catalogue, null)?.units.map((unit) => unit.points),
    assessment: calculateRosterAssessment(pricedInput, catalogue, null)?.points,
    total: calculateRosterTotals(pricedInput, catalogue, null)?.points,
  }).toEqual({ picker: 90, units: [90, 90, 105], assessment: 285, total: 285 })
})

it('uses MFM wargear prices after a selected option is saved and reloaded', () => {
  const catalogue = bookOf({
    selectionEntries: [
      {
        id: 'tank',
        name: 'Tank',
        type: 'model',
        costs: points(100),
        selectionEntryGroups: [
          {
            id: 'pintle',
            name: 'Pintle mount',
            constraints: [{ id: 'pintle-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
            selectionEntries: [{ id: 'melta', name: 'Multi-melta', type: 'upgrade' }],
          },
        ],
      },
    ],
  })
  catalogue.mfm = new Map([
    [
      'test-catalogue',
      {
        slug: 'test-catalogue',
        version: '1.5',
        units: [
          {
            name: 'Tank',
            pricing: [{ range: '[1,)', costs: [{ models: 1, points: 95 }] }],
            wargear: [{ item: 'Multi-melta', points: 10 }],
          },
        ],
      },
    ],
  ])
  const saved = JSON.parse(
    JSON.stringify({
      catalogueId: 'cat',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      picks: [{ entryId: 'tank', choices: { pintle: 'melta' } }],
    }),
  )
  const savedInput = savedRosterPriceInput(saved)
  const priced = calculateRosterPrice(savedInput, catalogue, null)

  expect({
    picker: priceOf(catalogue, 'cat', 'tank'),
    option: priced?.units[0]?.choices.find((choice) => choice.key === 'pintle')?.options[0]?.points,
    unit: priced?.units[0]?.points,
    roster: priced?.points,
    assessment: calculateRosterAssessment(savedInput, catalogue, null)?.points,
    total: calculateRosterTotals(savedInput, catalogue, null)?.points,
  }).toEqual({ picker: 95, option: 10, unit: 105, roster: 105, assessment: 105, total: 105 })
})

it('charges MFM only for the optional copy of required wargear', () => {
  const catalogue = bookOf({
    selectionEntries: [
      {
        id: 'tank',
        name: 'Tank',
        type: 'model',
        costs: points(100),
        selectionEntryGroups: [
          {
            id: 'pintle',
            name: 'Pintle Mount Option',
            constraints: [{ id: 'pintle-max', type: 'max', value: 3, field: 'selections', scope: 'parent' }],
            selectionEntries: [
              {
                id: 'melta',
                name: 'Multi-melta',
                type: 'upgrade',
                constraints: [
                  { id: 'melta-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
                  { id: 'melta-max', type: 'max', value: 3, field: 'selections', scope: 'parent' },
                ],
              },
              {
                id: 'stubber',
                name: 'Ironhail Heavy Stubber',
                type: 'upgrade',
                constraints: [{ id: 'stubber-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    ],
  })
  catalogue.mfm = new Map([
    [
      'test-catalogue',
      {
        slug: 'test-catalogue',
        version: '1.5',
        units: [
          {
            name: 'Tank',
            pricing: [{ range: '[1,)', costs: [{ models: 1, points: 95 }] }],
            wargear: [{ item: 'Multi-melta', points: 10 }],
          },
        ],
      },
    ],
  ])
  const saved = JSON.parse(
    JSON.stringify({
      catalogueId: 'cat',
      detachmentIds: [],
      disposition: null,
      limit: 2_000,
      picks: [{ entryId: 'tank', spreads: { pintle: { melta: 3 } } }],
    }),
  )
  const priced = calculateRosterPrice(savedRosterPriceInput(saved), catalogue, null)

  expect({ picker: priceOf(catalogue, 'cat', 'tank'), unit: priced?.units[0]?.points, errors: priced?.errors }).toEqual({
    picker: 95,
    unit: 105,
    errors: [],
  })
})

it('prices a printed replacement instruction from its MFM wargear row', () => {
  const unit = { name: 'Desolation Squad', pricing: [], wargear: [{ item: 'Vengor Launcher', points: 5 }] }

  expect(mfmWargearOptionPoints(unit, 'The Sergeant can have their Superfrag Rocket Launcher replaced with 1 Vengor Launcher.', [])).toBe(5)
})

it('prices a printed optional equipment instruction from its MFM wargear row', () => {
  const unit = { name: 'Vehicle', pricing: [], wargear: [{ item: 'Multi-melta', points: 10 }] }

  expect(mfmWargearOptionPoints(unit, 'This model can be equipped with 1 Multi-melta.', [])).toBe(10)
})

it('prices the individual weapons in a compound option', () => {
  const unit = {
    name: 'Forgefiend',
    pricing: [],
    wargear: [{ item: 'Ectoplasma cannon', points: 5 }],
  }

  expect(mfmWargearOptionPoints(unit, '2 ectoplasma cannons', [{ name: 'Ectoplasma cannon', count: 4 }], 2)).toBe(10)
})

it('joins a singular MFM wargear name to its plural catalogue option', () => {
  const unit = { name: 'Talos', pricing: [], wargear: [{ item: 'Twin haywire blaster', points: 5 }] }

  expect(mfmWargearOptionPoints(unit, 'Twin Haywire Blasters', [])).toBe(5)
})
