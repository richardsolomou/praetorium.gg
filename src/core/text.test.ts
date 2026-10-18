import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

it('formats lists without Intl.ListFormat', async () => {
  vi.stubGlobal('Intl', { ...Intl, ListFormat: undefined })
  const { formatList } = await import('./text')
  expect(formatList(['a', 'b', 'c'])).toBe('a, b and c')
})

it.each([
  [[], ''],
  [['a'], 'a'],
  [['a', 'b'], 'a and b'],
  [['a', 'b', 'c', 'd'], 'a, b, c and d'],
])('formats %j as %s', async (items, expected) => {
  const { formatList } = await import('./text')
  expect(formatList(items)).toBe(expected)
})
