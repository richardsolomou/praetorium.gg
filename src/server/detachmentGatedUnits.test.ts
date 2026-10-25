import { expect, it } from 'vitest'
import type { Condition } from '../core/catalogue'
import { bookOf, points } from './catalogue.fixtures'
import { unitsIn } from '../shared/cataloguePicker'
import { calculateRosterPrice } from '../shared/pricing'

const hiddenUnless = (condition: Condition) => [{ field: 'hidden', type: 'set' as const, value: true, conditions: [condition] }]

// The shape BSData gives Deathwatch units in a chapter army: hidden until Deathwatch Support is taken.
const loaded = bookOf({
  selectionEntries: [
    { id: 'marine', name: 'Marine', type: 'unit', costs: points(80) },
    {
      id: 'veteran',
      name: 'Veteran',
      type: 'unit',
      costs: points(100),
      modifiers: hiddenUnless({
        childId: 'support',
        field: 'selections',
        scope: 'force',
        type: 'lessThan',
        value: 1,
        includeChildSelections: true,
      }),
    },
    {
      id: 'relic',
      name: 'Relic',
      type: 'unit',
      costs: points(100),
      modifiers: hiddenUnless({ childId: 'other-book', field: 'selections', scope: 'primary-catalogue', type: 'notInstanceOf', value: 1 }),
    },
  ],
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
            { id: 'gladius', name: 'Gladius Task Force', type: 'upgrade' },
            { id: 'support', name: 'Veteran Support', type: 'upgrade' },
          ],
        },
      ],
    },
  ],
})

const listed = (detachmentIds: string[]) => unitsIn(loaded, 'cat', '', { detachmentIds }).map((unit) => unit.name)
const errors = (detachmentIds: string[]) =>
  calculateRosterPrice(
    { catalogueId: 'cat', detachmentIds, disposition: null, limit: 2000, units: [{ entryId: 'veteran' }] },
    loaded,
    null,
  )!.errors.map((error) => `${error.entryName}: ${error.message}`)

it('leaves a unit out of the picker until its detachment is taken', () => {
  expect(listed(['gladius'])).not.toContain('Veteran')
})

it('offers a unit once its detachment is taken', () => {
  expect(listed(['support'])).toContain('Veteran')
})

it('lists a unit a detachment unlocks while no detachment is chosen', () => {
  expect(listed([])).toContain('Veteran')
})

it('keeps listing a unit that every detachment hides alike', () => {
  expect(listed(['gladius'])).toContain('Relic')
})

it('reports a unit held without the detachment that unlocks it', () => {
  expect(errors(['gladius'])).toEqual(['Veteran: needs the Veteran Support detachment'])
})

it('accepts a unit held with the detachment that unlocks it', () => {
  expect(errors(['support'])).toEqual([])
})
