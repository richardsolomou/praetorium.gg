import { afterEach, expect, it, vi } from 'vitest'
import { warm } from './app'

afterEach(() => vi.useRealTimers())

it('warms catalogue data after yielding startup', async () => {
  vi.useFakeTimers()
  const loaded: string[] = []
  const ready = warm({
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
  await ready
  expect({ beforeYield, loaded }).toEqual({ beforeYield: [], loaded: ['catalogue', 'rules'] })
})
