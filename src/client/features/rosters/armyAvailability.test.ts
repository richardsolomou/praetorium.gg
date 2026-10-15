import { expect, it } from 'vitest'
import { armyAvailability } from './armyAvailability'

const index = ['current-book']

it('waits for a book whose read has not started, as on the server render', () => {
  expect(armyAvailability('older-book', { status: 'pending', faction: undefined }, index)).toBe('loading')
})

it('does not call a book replaced when reading it failed', () => {
  expect(armyAvailability('older-book', { status: 'error', faction: undefined }, index)).toBe('unavailable')
})

it('calls a book replaced when the server has no such book and the index does not list it', () => {
  expect(armyAvailability('older-book', { status: 'success', faction: null }, index)).toBe('replaced')
})

it('does not call an indexed book replaced', () => {
  expect(armyAvailability('current-book', { status: 'success', faction: null }, index)).toBe('unavailable')
})

it('does not call a book replaced before the index has loaded', () => {
  expect(armyAvailability('older-book', { status: 'success', faction: null }, undefined)).toBe('unavailable')
})

it('opens a roster whose book loaded', () => {
  expect(armyAvailability('older-book', { status: 'error', faction: { id: 'older-book' } }, index)).toBe('ready')
})
