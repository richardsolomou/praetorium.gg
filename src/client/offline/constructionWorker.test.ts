import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ConstructionWorkerRequest } from './construction.worker'

const mocks = vi.hoisted(() => ({
  userState: 'identified' as string | undefined,
  capture: vi.fn(),
  workers: [] as FakeWorker[],
  current: vi.fn(),
  held: vi.fn(),
  offline: vi.fn(),
  published: [] as (() => void)[],
}))

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  sent: ConstructionWorkerRequest[] = []
  terminated = false
  constructor() {
    mocks.workers.push(this)
  }
  postMessage(message: ConstructionWorkerRequest) {
    this.sent.push(message)
  }
  terminate() {
    this.terminated = true
  }
  of<K extends ConstructionWorkerRequest['kind']>(kind: K) {
    return this.sent.filter((message): message is Extract<ConstructionWorkerRequest, { kind: K }> => message.kind === kind)
  }
  /** Finishes every preparation asked of this worker. */
  prepare() {
    for (const { keys } of this.of('prepare')) this.message({ prepared: keys })
  }
  answer(value: object, id = this.of('read').at(-1)!.id) {
    this.message({ id, ...value })
  }
  message(data: unknown) {
    this.onmessage?.({ data })
  }
}

vi.mock('./construction.worker?worker&inline', () => ({ default: FakeWorker }))
vi.mock('posthog-js', () => ({ posthog: { get_property: () => mocks.userState, capture: mocks.capture } }))
vi.mock('./runtime', () => ({
  currentReference: mocks.current,
  referenceData: mocks.held,
  offlineData: mocks.offline,
  subscribeReference: (listener: () => void) => mocks.published.push(listener),
}))

let worker: typeof import('./constructionWorker')
const download = (revision: string) => ({
  download: {
    revision,
    construction: { catalogue: `/assets/construction-${revision}.bin`, rules: '/assets/construction-r.bin', editions: {} },
  },
})
const DOWNLOAD = download('a')

beforeEach(async () => {
  vi.resetModules()
  mocks.workers.length = 0
  mocks.published.length = 0
  mocks.userState = 'identified'
  mocks.capture.mockReset()
  mocks.current.mockReturnValue(DOWNLOAD)
  mocks.held.mockReturnValue(DOWNLOAD)
  mocks.offline.mockReturnValue(undefined)
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('location', { href: 'https://praetorium.gg/simulator' })
  worker = await import('./constructionWorker')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const loaded = () => vi.dynamicImportSettled()
const wounds = () => worker.deviceConstructionRead('unitWounds', { catalogueId: 'cat', entryIds: [] }, 'cat')
const units = () => worker.deviceConstructionRead('units', { catalogueId: 'cat', query: '' }, 'cat')
/** Makes a read only for what it starts; one the worker answers is left to settle unobserved. */
const start = (read: () => Promise<unknown> | null) => void read()?.catch(() => {})
/** A worker that has built its data, as the roster builder's first unit read leaves one. */
const prepared = async () => {
  start(units)
  await loaded()
  mocks.workers[0]!.prepare()
}
const disconnected = () => {
  vi.stubGlobal('navigator', { onLine: false })
  mocks.current.mockReturnValue(undefined)
}

it('leaves a read to the server while the worker has not prepared it', () => {
  expect(wounds()).toBeNull()
})

it('leaves other pages’ reads to the server without building construction data for them while connected', async () => {
  start(wounds)
  await loaded()
  expect(mocks.workers).toHaveLength(0)
})

it('starts preparing an unanswered unit read from the published download’s parts', async () => {
  start(units)
  await loaded()
  expect(mocks.workers[0]!.of('prepare')).toEqual([
    {
      kind: 'prepare',
      source: {
        id: 'a',
        parts: {
          catalogue: 'https://praetorium.gg/assets/construction-a.bin',
          rules: 'https://praetorium.gg/assets/construction-r.bin',
          editions: {},
        },
      },
      catalogueId: 'cat',
      units: true,
      keys: ['build:', 'units:cat'],
    },
  ])
})

it('answers a prepared read from the worker', async () => {
  await prepared()
  const answer = wounds()!
  mocks.workers[0]!.answer({ value: 'wounds' })
  expect(await answer).toBe('wounds')
})

const otherUnits = () => worker.deviceConstructionRead('units', { catalogueId: 'other', query: '' }, 'other')

it('leaves unit reads to the server until their faction is prepared', async () => {
  await prepared()
  expect(otherUnits()).toBeNull()
})

it('prepares the faction of an unanswered unit read', async () => {
  await prepared()
  start(otherUnits)
  expect(mocks.workers[0]!.of('prepare').at(-1)?.keys).toEqual(['units:other'])
})

it('answers unit reads once their faction is prepared', async () => {
  start(units)
  await loaded()
  mocks.workers[0]!.prepare()
  const answer = units()!
  mocks.workers[0]!.answer({ value: 'units' })
  expect(await answer).toBe('units')
})

it('prepares a rules version apart from the current rules', async () => {
  await prepared()
  expect(worker.deviceConstructionRead('unitWounds', { catalogueId: 'mfm~cat', entryIds: [] }, 'mfm~cat')).toBeNull()
})

it('does not ask for a preparation already under way', async () => {
  start(units)
  start(units)
  await loaded()
  expect(mocks.workers[0]!.of('prepare').length).toBe(1)
})

it('asks again after a preparation failed', async () => {
  start(units)
  await loaded()
  mocks.workers[0]!.message({ unprepared: ['build:', 'units:cat'] })
  start(units)
  expect(mocks.workers[0]!.of('prepare').length).toBe(2)
})

it('leaves reads to the server without a current construction download', () => {
  mocks.current.mockReturnValue(undefined)
  start(units)
  expect(mocks.workers.length).toBe(0)
})

it('prepares once the service confirms the download asked for earlier is current', async () => {
  mocks.current.mockReturnValue(undefined)
  worker.prepareDeviceConstruction('cat', true)
  mocks.current.mockReturnValue(DOWNLOAD)
  for (const listener of mocks.published) listener()
  await loaded()
  expect(mocks.workers[0]!.of('prepare')[0]?.keys).toEqual(['build:', 'units:cat'])
})

it('waits for the worker to prepare a read while disconnected, since nothing else can answer it', async () => {
  disconnected()
  const answer = wounds()!
  await loaded()
  mocks.workers[0]!.prepare()
  await vi.waitFor(() => expect(mocks.workers[0]!.of('read')).toHaveLength(1))
  mocks.workers[0]!.answer({ value: 'wounds' })
  expect(await answer).toBe('wounds')
})

it('reads the download the page holds while disconnected', async () => {
  disconnected()
  start(wounds)
  await loaded()
  expect(mocks.workers[0]!.of('prepare')[0]?.source.id).toBe('a')
})

it('lets a disconnected read fall back when the worker cannot prepare it', async () => {
  disconnected()
  const answer = wounds()!
  await loaded()
  mocks.workers[0]!.message({ unprepared: ['build:'] })
  await expect(answer).rejects.toThrow('could not be prepared')
})

it('replaces the worker when the download changes', async () => {
  await prepared()
  mocks.current.mockReturnValue(download('b'))
  start(units)
  await loaded()
  expect({ workers: mocks.workers.length, stopped: mocks.workers[0]!.terminated }).toEqual({ workers: 2, stopped: true })
})

it('gives up on a download the worker cannot read', async () => {
  start(units)
  await loaded()
  mocks.workers[0]!.message({ unavailable: 'offline' })
  start(units)
  await loaded()
  expect(mocks.workers.length).toBe(1)
})

it('reports a read the rules cannot answer without stopping the worker', async () => {
  await prepared()
  const answer = wounds()!
  mocks.workers[0]!.answer({ error: 'Unknown datasheet' })
  await expect(answer).rejects.toThrow('Unknown datasheet')
  expect(mocks.workers[0]!.terminated).toBe(false)
})

it('stops an idle worker so it does not keep the catalogue in memory', async () => {
  await prepared()
  vi.useFakeTimers()
  mocks.workers[0]!.prepare()
  vi.advanceTimersByTime(worker.CONSTRUCTION_WORKER_IDLE_MS)
  expect(mocks.workers[0]!.terminated).toBe(true)
})

it('keeps a worker that is still preparing', async () => {
  start(units)
  await loaded()
  vi.useFakeTimers()
  vi.advanceTimersByTime(worker.CONSTRUCTION_WORKER_IDLE_MS)
  expect(mocks.workers[0]!.terminated).toBe(false)
})

it('keeps a worker that is still answering a read', async () => {
  await prepared()
  vi.useFakeTimers()
  start(wounds)
  vi.advanceTimersByTime(worker.CONSTRUCTION_WORKER_IDLE_MS)
  expect(mocks.workers[0]!.terminated).toBe(false)
})

it('leaves reads to the server once a newer release is published', async () => {
  await prepared()
  worker.retireDeviceConstruction()
  expect(wounds()).toBeNull()
})

it('stops the worker when a newer release is published', async () => {
  await prepared()
  worker.retireDeviceConstruction()
  expect(mocks.workers[0]!.terminated).toBe(true)
})

it('rejects a read in flight when a newer release retires the worker, so the server answers it', async () => {
  await prepared()
  const answer = wounds()!
  worker.retireDeviceConstruction()
  await expect(answer).rejects.toThrow('newer release')
})

it('rejects reads in flight when the worker crashes', async () => {
  await prepared()
  const answer = wounds()!
  mocks.workers[0]!.onerror?.()
  await expect(answer).rejects.toThrow('failed')
})

it('stops using the device after the worker crashes', async () => {
  await prepared()
  mocks.workers[0]!.onerror?.()
  expect(wounds()).toBeNull()
})

const priced = async (event: object) => {
  await prepared()
  const answer = worker.deviceConstructionRead('priceRoster', { catalogueId: 'cat' } as never, 'cat')!
  mocks.workers[0]!.answer({ value: 'price', event })
  await answer
}

it('records the event the server would have recorded for a read the device answered', async () => {
  await priced({ name: 'roster_datasheet_loaded', properties: { unit_count: 2 } })
  expect(mocks.capture).toHaveBeenCalledWith('roster_datasheet_loaded', { unit_count: 2 })
})

it('records device events only for signed-in players, as the server does', async () => {
  mocks.userState = 'anonymous'
  await priced({ name: 'roster_datasheet_loaded', properties: {} })
  expect(mocks.capture).not.toHaveBeenCalled()
})

it('samples device events at the server’s rate', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  await priced({ name: 'roster_priced', properties: {}, sampleRate: 0.1 })
  expect(mocks.capture).not.toHaveBeenCalled()
})

const input = { catalogueId: 'cat', picks: [{ entryId: 'unit' }], pickIndex: 0 }
const searching = async (signal = new AbortController().signal) => {
  const reader = worker.deviceLoadoutSearch(input, signal)!.body!.getReader()
  const first = reader.read()
  await loaded()
  mocks.workers[0]!.prepare()
  await vi.waitFor(() => expect(mocks.workers[0]!.of('search')).toHaveLength(1))
  return { reader, first, id: mocks.workers[0]!.of('search')[0]!.id }
}

it('streams a loadout search from the worker a batch at a time once it has loaded its data', async () => {
  const { first, id } = await searching()
  mocks.workers[0]!.message({ id, batch: { candidates: [], built: 1, scheduled: 1, done: false } })
  expect(new TextDecoder().decode((await first).value)).toBe('{"candidates":[],"built":1,"scheduled":1,"done":false}\n')
})

it('asks for the next batch only as the page reads it, and closes when the search is done', async () => {
  const { reader, first, id } = await searching()
  mocks.workers[0]!.message({ id, batch: { candidates: [], built: 1, scheduled: 1, done: false } })
  await first
  const last = reader.read()
  await vi.waitFor(() => expect(mocks.workers[0]!.of('next')).toEqual([{ kind: 'next', id }]))
  mocks.workers[0]!.message({ id, done: true })
  expect((await last).done).toBe(true)
})

it('stops the worker’s search when the page cancels it', async () => {
  const controller = new AbortController()
  const { first } = await searching(controller.signal)
  void first.catch(() => {})
  controller.abort()
  expect(mocks.workers[0]!.of('stop')).toHaveLength(1)
})

it('leaves a loadout search to the server without construction data on the device', () => {
  mocks.current.mockReturnValue(undefined)
  expect(worker.deviceLoadoutSearch(input, new AbortController().signal)).toBeNull()
})
