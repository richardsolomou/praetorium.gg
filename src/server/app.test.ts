import { afterEach, expect, it, vi } from 'vitest'
import { warm } from './app'

afterEach(() => vi.useRealTimers())

it('warms catalogue data after yielding startup', async () => {
  vi.useFakeTimers()
  const loaded: string[] = []
  const ready = warm({
    prepareCatalogue: () => {
      loaded.push('construction')
    },
    searchIndexFor: async () => {
      loaded.push('search')
      return null
    },
    canonicalCatalogue: () => {
      loaded.push('canonical')
      return null
    },
    combatUnits: () => {
      loaded.push('simulator')
      return []
    },
  })
  const beforeYield = [...loaded]
  await vi.runAllTimersAsync()
  await ready
  expect({ beforeYield, loaded }).toEqual({ beforeYield: [], loaded: ['search', 'canonical', 'simulator', 'construction'] })
})
