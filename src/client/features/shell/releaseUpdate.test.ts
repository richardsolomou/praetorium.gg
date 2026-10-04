import { expect, it } from 'vitest'
import { newerRelease } from './releaseUpdate'
it.each([
  ['0.101.1', '0.101.2', true],
  ['0.101.1', '0.102.0', true],
  ['0.101.1', '1.0.0', true],
  ['0.9.1', '0.10.0', true],
  ['0.101.1', '0.101.1', false],
  ['0.101.1', '0.101.0', false],
  ['1.0.0', '0.999.999', false],
  ['0.101.1', 'bad', false],
  ['bad', '0.101.2', false],
])('compares running %s with served %s: newer=%s', (current, latest, expected) => {
  expect(newerRelease(current, latest)).toBe(expected)
})
