import { afterEach, expect, it, vi } from 'vitest'
import { readiness, warm } from './app'
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

it('answers startup readiness before the other editions are built', async () => {
  const serving = construction(10)
  const others = construction(1_000)
  await warm({ ...projections(), construction: (scope) => (scope === 'serving' ? serving : others).steps() }, true)
  expect({ serving: serving.progress.steps, others: others.progress.steps < 1_000 }).toEqual({ serving: 10, others: true })
})

it('builds the other editions once startup readiness is answered', async () => {
  const others = construction(10)
  await warm({ ...projections(), construction: (scope) => (scope === 'serving' ? construction(0) : others).steps() }, true)
  await turns(20)
  expect(others.progress.steps).toBe(10)
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

/** A readiness whose warm-ups resolve only when the test says, recording whether each held for the build. */
function startups() {
  const held: boolean[] = []
  const finish: (() => void)[] = []
  const startup = readiness((untilBuilt) => {
    held.push(untilBuilt)
    return new Promise<void>((resolve) => finish.push(resolve))
  })
  return { held, finish, startup }
}

it('holds production startup readiness for the build', () => {
  vi.stubEnv('NODE_ENV', 'production')
  const { held, startup } = startups()
  startup.warm()
  expect(held).toEqual([true])
})

it('answers readiness before the build outside production', () => {
  vi.stubEnv('NODE_ENV', 'development')
  const { held, startup } = startups()
  startup.warm()
  expect(held).toEqual([false])
})

it('holds readiness for the build of a swap that lands during startup', () => {
  vi.stubEnv('NODE_ENV', 'production')
  const { held, startup } = startups()
  startup.warm()
  startup.warm()
  expect(held).toEqual([true, true])
})

it('waits for the warm-up a swap started while readiness was waiting', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const { finish, startup } = startups()
  startup.warm()
  let answered = false
  void startup.ready().then(() => (answered = true))
  startup.warm()
  finish[0]!()
  await turns(2)
  expect(answered).toBe(false)
})

it('answers readiness during a swap on a replica already serving', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const { held, finish, startup } = startups()
  startup.warm()
  finish[0]!()
  await startup.ready()
  startup.warm()
  expect(held).toEqual([true, false])
})
