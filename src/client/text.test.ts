import { expect, it } from 'vitest'
import { countLabel, formatList } from './text'

it('lists three names without a serial comma', () => {
  expect(formatList(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob and Carol')
})

it('joins two names with and', () => {
  expect(formatList(['Alice', 'Bob'])).toBe('Alice and Bob')
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
