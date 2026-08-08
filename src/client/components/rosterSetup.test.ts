import { expect, it } from 'vitest'
import { dispositionsFor } from './rosterSetup'

it('offers the dispositions of every selected detachment once', () => {
  expect(
    dispositionsFor(
      [
        { id: 'one', dispositions: [{ id: 'reconnaissance', name: 'Reconnaissance' }] },
        {
          id: 'two',
          dispositions: [
            { id: 'reconnaissance', name: 'Reconnaissance' },
            { id: 'priority-assets', name: 'Priority Assets' },
          ],
        },
      ],
      ['one', 'two'],
    ),
  ).toEqual([
    { id: 'reconnaissance', name: 'Reconnaissance' },
    { id: 'priority-assets', name: 'Priority Assets' },
  ])
})
