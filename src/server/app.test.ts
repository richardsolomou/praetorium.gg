import { afterEach, expect, it, vi } from 'vitest'
import { warm } from './app'
import type { Steps } from '../shared/steps'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const projections = (loaded: string[] = []) => ({
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
  catalogue: () => {
    loaded.push('construction catalogue')
    return null
  },
})

/** Construction that counts its steps, each holding the thread for `ms`. */
function construction(total: number, ms = 0) {
  const progress = { steps: 0 }
  function* steps(): Steps<void> {
    while (progress.steps < total) {
      const until = performance.now() + ms
      while (performance.now() < until);
      progress.steps++
      yield
    }
  }
  return { progress, steps }
}

const turns = async (count: number) => {
  for (let turn = 0; turn < count; turn++) await new Promise<void>((resolve) => setImmediate(resolve))
}

it('loads the page projections after yielding startup', async () => {
  vi.useFakeTimers()
  const loaded: string[] = []
  const ready = warm({ ...projections(loaded), construction: construction(0).steps })
  const beforeYield = [...loaded]
  await vi.runAllTimersAsync()
  await ready
  expect({ beforeYield, loaded }).toEqual({ beforeYield: [], loaded: ['search', 'canonical', 'simulator', 'construction catalogue'] })
})

it('answers readiness before the construction indexes are built', async () => {
  const { progress, steps } = construction(1_000)
  await warm({ ...projections(), construction: steps })
  expect(progress.steps).toBeLessThan(1_000)
})

it('answers startup readiness once the construction indexes are built', async () => {
  const { progress, steps } = construction(1_000)
  await warm({ ...projections(), construction: steps }, true)
  expect(progress.steps).toBe(1_000)
})

it('serves other work while startup readiness waits for construction', async () => {
  let answered = false
  void warm({ ...projections(), construction: construction(50, 5).steps }, true).then(() => (answered = true))
  const answeredBeforeTimer = await new Promise<boolean>((resolve) => setTimeout(() => resolve(answered)))
  expect(answeredBeforeTimer).toBe(false)
})

it('leaves construction indexes to their first request in a browser-test stack', async () => {
  vi.stubEnv('LOCAL_TEST_MODE', 'true')
  const { progress, steps } = construction(10)
  await warm({ ...projections(), construction: steps })
  await turns(5)
  expect(progress.steps).toBe(0)
})

it('serves other work between construction steps', async () => {
  const { progress, steps } = construction(50, 5)
  await warm({ ...projections(), construction: steps })
  const stepsBeforeTimer = await new Promise<number>((resolve) => setTimeout(() => resolve(progress.steps)))
  expect(stepsBeforeTimer).toBeLessThan(50)
})

it('stops building construction indexes for loaders a sync swap replaced', async () => {
  const replaced = construction(10_000, 1)
  const instance = { ...projections(), construction: replaced.steps }
  await warm(instance)
  instance.construction = construction(0).steps
  await turns(2)
  const stepsAtSwap = replaced.progress.steps
  await turns(5)
  expect(replaced.progress.steps).toBe(stepsAtSwap)
})
