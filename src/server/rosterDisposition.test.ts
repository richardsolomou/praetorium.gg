import { expect, it } from 'vitest'
import { calculateRosterPrice } from '../shared/pricing'
import { bookOf } from './catalogue.fixtures'

const loaded = bookOf({
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
            { id: 'first', name: 'First', type: 'upgrade', categoryLinks: [{ id: 'take-link', name: 'Take and Hold', targetId: 'take' }] },
            {
              id: 'second',
              name: 'Second',
              type: 'upgrade',
              categoryLinks: [{ id: 'purge-link', name: 'Purge the Foe', targetId: 'purge' }],
            },
          ],
        },
      ],
    },
  ],
})
it.each([null, 'take-and-hold', 'purge-the-foe'] as const)(
  'uses the authoritative resolved disposition %s with multiple purchased detachments',
  (disposition) => {
    const price = calculateRosterPrice(
      { catalogueId: 'cat', detachmentIds: ['first', 'second'], disposition, limit: 2000, units: [] },
      loaded,
      null,
    )
    expect(price?.disposition ?? null).toBe(disposition)
  },
)
