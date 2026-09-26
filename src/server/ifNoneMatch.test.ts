import { expect, it } from 'vitest'
import { ifNoneMatch } from './ifNoneMatch'

it.each([
  ['"other", W/"wanted"', true],
  ['*', true],
  ['"other"', false],
])('matches a conditional request with %s', (header, expected) => {
  expect(ifNoneMatch(new Request('https://praetorium.gg/', { headers: { 'If-None-Match': header } }), '"wanted"')).toBe(expected)
})
