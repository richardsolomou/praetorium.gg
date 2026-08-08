import { afterEach, expect, it, vi } from 'vitest'
import { warm } from './app'

afterEach(() => vi.useRealTimers())

it('warms catalogue data after yielding startup', async () => {
  vi.useFakeTimers()
  const loaded: string[] = []
  warm({
    catalogue: () => {
      loaded.push('catalogue')
      return null
    },
    rules: () => {
      loaded.push('rules')
      return null
    },
  })
  const beforeYield = [...loaded]
  await vi.runAllTimersAsync()
  expect({ beforeYield, loaded }).toEqual({ beforeYield: [], loaded: ['catalogue', 'rules'] })
})
