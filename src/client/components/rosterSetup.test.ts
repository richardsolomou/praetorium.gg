import { expect, it } from 'vitest'
import { dispositionsFor, dispositionTone } from './rosterSetup'

it('colors a display name like its disposition id', () => {
  expect(dispositionTone('Take and Hold')).toBe(dispositionTone('take-and-hold'))
})

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
