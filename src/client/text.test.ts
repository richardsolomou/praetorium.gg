import { expect, it } from 'vitest'
import { asSentence, countLabel } from './text'

it('starts a refusal shown to the player with a capital letter', () => {
  expect(asSentence('you are not in this battle')).toBe('You are not in this battle.')
})

it('keeps a refusal that already ends as it is', () => {
  expect(asSentence('Choose a roster first.')).toBe('Choose a roster first.')
})

it('names one thing in the singular', () => {
  expect(countLabel(1, 'roster')).toBe('1 roster')
})

it('names other counts with a regular plural', () => {
  expect(countLabel(0, 'roster')).toBe('0 rosters')
})

it('names other counts with an irregular plural', () => {
  expect(countLabel(2, 'loss', 'losses')).toBe('2 losses')
})
