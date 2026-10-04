import { describe, expect, it } from 'vitest'
import { appliesInMode } from './scoring'

describe('secondary payout modes', () => {
  it.each([
    ['standard', 'tactical', true],
    ['standard', 'fixed', true],
    [null, 'tactical', true],
    [null, 'fixed', true],
    ['tactical', 'tactical', true],
    ['fixed', 'fixed', true],
    ['fixed', 'tactical', false],
    ['tactical', 'fixed', false],
    ['fixed', undefined, true],
    ['tactical', undefined, true],
  ] as const)('%s payout in %s play applies: %s', (payoutMode, mode, expected) => {
    expect(appliesInMode({ mode: payoutMode }, mode)).toBe(expected)
  })
})
