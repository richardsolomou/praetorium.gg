import { expect, it } from 'vitest'
import { bookOf, shelfOf } from './catalogue.fixtures'
import { detachmentPoints } from './detachmentPoints'
import { factionsFor } from './factionReferences'
import { calculateRosterPrice } from './pricing'

const dp = 'cost-detachment-points'
const loaded = bookOf({
  selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }],
  sharedSelectionEntries: [
    {
      id: 'wrapper',
      name: 'Detachment',
      type: 'upgrade',
      selectionEntryGroups: [
        {
          id: 'choices',
          name: 'Detachment',
          selectionEntries: [
            { id: 'anvil', name: 'Anvil Siege Force', type: 'upgrade', costs: [{ name: 'Detachment Points', typeId: dp, value: 2 }] },
            { id: 'unknown', name: 'Unknown Force', type: 'upgrade' },
          ],
        },
      ],
    },
  ],
})
loaded.index.costTypes.set(dp, { id: dp, name: 'Detachment Points' })

it('uses the evaluated BSData cost when Game Datacards has no detachment card', () => {
  expect(detachmentPoints(loaded, 'cat', 'anvil', undefined)).toBe(2)
})

it('applies the importing chapter’s BSData DP modifier', () => {
  const modified = shelfOf(
    {
      selectionEntries: [{ id: 'marine', name: 'Marine', type: 'unit' }],
      sharedSelectionEntries: [
        {
          id: 'wrapper',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'choices',
              name: 'Detachment',
              selectionEntries: [
                {
                  id: 'bastion',
                  name: 'Bastion Task Force',
                  type: 'upgrade',
                  costs: [{ name: 'Detachment Points', typeId: dp, value: 2 }],
                  modifiers: [
                    {
                      field: dp,
                      type: 'set',
                      value: 3,
                      conditions: [{ childId: 'cat-1', field: 'selections', scope: 'primary-catalogue', type: 'instanceOf', value: 1 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      selectionEntries: [{ id: 'chapter', name: 'Chapter unit', type: 'unit' }],
      catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
    },
  )
  modified.index.costTypes.set(dp, { id: dp, name: 'Detachment Points' })

  expect([detachmentPoints(modified, 'cat', 'bastion', undefined), detachmentPoints(modified, 'cat-1', 'bastion', undefined)]).toEqual([
    2, 3,
  ])
})

it('keeps a present Game Datacards cost authoritative', () => {
  expect(detachmentPoints(loaded, 'cat', 'anvil', { points: 1 })).toBe(1)
})

it('uses MFM DP above an older card and catalogue cost', () => {
  const current = {
    ...loaded,
    mfm: new Map([
      ['test-catalogue', { slug: 'test-catalogue', version: '1.5', units: [], detachments: [{ name: 'Anvil Siege Force', dp: 3 }] }],
    ]),
  }
  expect(detachmentPoints(current, 'cat', 'anvil', { points: 1 })).toBe(3)
})

it('does not replace an unresolved Game Datacards cost', () => {
  expect(detachmentPoints(loaded, 'cat', 'anvil', { points: null })).toBeNull()
})

it('keeps an unpriced BSData detachment unknown', () => {
  expect(detachmentPoints(loaded, 'cat', 'unknown', undefined)).toBeNull()
})

it('shows the fallback cost in the faction picker', () => {
  expect(factionsFor(loaded, null).factions[0]?.detachments.find((entry) => entry.id === 'anvil')).toMatchObject({
    points: 2,
    reference: null,
  })
})

it('uses the fallback cost in roster pricing', () => {
  const priced = calculateRosterPrice(
    { catalogueId: 'cat', detachmentIds: ['anvil'], disposition: null, limit: 2_000, units: [] },
    loaded,
    null,
  )
  expect(priced?.detachments).toEqual([{ name: 'Anvil Siege Force', points: 2 }])
})
