import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reset = vi.hoisted(() => vi.fn())

vi.mock('posthog-js', () => ({ default: { reset } }))

import { finishPasswordRecovery } from './passwordRecovery'

describe('password recovery completion', () => {
  const replace = vi.fn()

  beforeEach(() => {
    reset.mockClear()
    replace.mockClear()
    vi.stubGlobal('window', { location: { replace } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('clears the identified analytics user before navigation', () => {
    finishPasswordRecovery('/sign-in?reset=true')

    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0]!)
  })

  it('replaces the consumed reset link', () => {
    finishPasswordRecovery('/sign-in?reset=true&next=%2Fbattles%2F123')

    expect(replace).toHaveBeenCalledWith('/sign-in?reset=true&next=%2Fbattles%2F123')
  })
})
