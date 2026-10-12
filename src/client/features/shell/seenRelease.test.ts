import { expect, it } from 'vitest'
import { unseenChanges } from './seenRelease'

const notes = [
  { version: '0.134.0', changes: ['Newest'] },
  { version: '0.133.1', changes: ['Middle'] },
  { version: '0.133.0', changes: ['Already seen'] },
]

it('lists the changes released after the acknowledged version, newest first', () => {
  expect(unseenChanges(notes, '0.133.0', '0.134.0')).toEqual(['Newest', 'Middle'])
})

it('lists nothing when the acknowledged version is current', () => {
  expect(unseenChanges(notes, '0.134.0', '0.134.0')).toEqual([])
})

it('leaves out releases newer than the running app', () => {
  expect(unseenChanges(notes, '0.133.0', '0.133.1')).toEqual(['Middle'])
})
