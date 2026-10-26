import { expect, it } from 'vitest'
import { formatList } from './text'

it.each([
  [[], ''],
  [['a'], 'a'],
  [['a', 'b'], 'a and b'],
  [['a', 'b', 'c'], 'a, b and c'],
  [['a', 'b', 'c', 'd'], 'a, b, c and d'],
])('formats %j as %s', (items, expected) => {
  expect(formatList(items)).toBe(expected)
})
