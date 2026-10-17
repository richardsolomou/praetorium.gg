import { afterEach, beforeEach, expect, it, vi } from 'vitest'

type Sent = { kind: 'read' | 'prepare'; id?: number; url: string; catalogueId?: string; units?: boolean; keys?: string[] }

const mocks = vi.hoisted(() => ({
  workers: [] as FakeWorker[],
  current: vi.fn(),
  published: [] as (() => void)[],
}))

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  sent: Sent[] = []
  terminated = false
  constructor() {
    mocks.workers.push(this)
  }
  postMessage(message: Sent) {
    this.sent.push(message)
  }
  terminate() {
    this.terminated = true
  }
  get reads() {
    return this.sent.filter((message) => message.kind === 'read')
  }
  get preparations() {
    return this.sent.filter((message) => message.kind === 'prepare')
  }
  /** Finishes every preparation asked of this worker. */
  prepare() {
    for (const { keys } of this.preparations) this.message({ prepared: keys })
  }
  answer(value: unknown, index = this.reads.length - 1) {
    this.message({ id: this.reads[index]!.id, ...(value as object) })
  }
  message(data: unknown) {
    this.onmessage?.({ data })
  }
}

vi.mock('./construction.worker?worker', () => ({ default: FakeWorker }))
vi.mock('./runtime', () => ({
  currentReference: mocks.current,
  offlineData: () => undefined,
  subscribePublishedReferenceRevision: (listener: () => void) => mocks.published.push(listener),
}))

let worker: typeof import('./constructionWorker')

beforeEach(async () => {
  vi.resetModules()
  mocks.workers.length = 0
  mocks.published.length = 0
  mocks.current.mockReturnValue({ constructionBundle: '/assets/construction-a.bin' })
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('navigator', { onLine: true })
  worker = await import('./constructionWorker')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const wounds = () => worker.deviceConstructionRead('unitWounds', { catalogueId: 'cat', entryIds: [] }, 'cat')
const units = () => worker.deviceConstructionRead('units', { catalogueId: 'cat', query: '' }, 'cat')
/** Makes a read only for what it starts; one the worker answers is left to settle unobserved. */
const start = (read: () => Promise<unknown> | null) => void read()?.catch(() => {})
/** A worker that has built its data, as the first read leaves one. */
const prepared = () => {
  start(wounds)
  mocks.workers[0]!.prepare()
}

it('leaves a read to the server while the worker has not prepared it', () => {
  expect(wounds()).toBeNull()
})

it('starts preparing what an unanswered read needs', () => {
  start(wounds)
  expect(mocks.workers[0]!.preparations).toEqual([
    { kind: 'prepare', url: '/assets/construction-a.bin', catalogueId: 'cat', units: false, keys: ['build:'] },
  ])
})

it('answers a prepared read from the worker', async () => {
  prepared()
  const answer = wounds()!
  mocks.workers[0]!.answer({ value: 'wounds' })
  expect(await answer).toBe('wounds')
})

it('leaves unit reads to the server until their faction is prepared', () => {
  prepared()
  expect(units()).toBeNull()
})

it('prepares the faction of an unanswered unit read', () => {
  prepared()
  start(units)
  expect(mocks.workers[0]!.preparations.at(-1)?.keys).toEqual(['units:cat'])
})

it('answers unit reads once their faction is prepared', () => {
  start(units)
  mocks.workers[0]!.prepare()
  expect(units()).not.toBeNull()
})

it('prepares a rules version apart from the current rules', () => {
  prepared()
  expect(worker.deviceConstructionRead('unitWounds', { catalogueId: 'mfm~cat', entryIds: [] }, 'mfm~cat')).toBeNull()
})

it('does not ask for a preparation already under way', () => {
  start(wounds)
  start(wounds)
  expect(mocks.workers[0]!.preparations.length).toBe(1)
})

it('asks again after a preparation failed', () => {
  start(wounds)
  mocks.workers[0]!.message({ unprepared: ['build:'] })
  start(wounds)
  expect(mocks.workers[0]!.preparations.length).toBe(2)
})

it('does not prepare while offline', () => {
  vi.stubGlobal('navigator', { onLine: false })
  start(wounds)
  expect(mocks.workers.length).toBe(0)
})

it('leaves reads to the server without a current construction download', () => {
  mocks.current.mockReturnValue(undefined)
  start(wounds)
  expect(mocks.workers.length).toBe(0)
})

it('prepares once the service confirms the download asked for earlier is current', () => {
  mocks.current.mockReturnValue(undefined)
  worker.prepareDeviceConstruction('cat', true)
  mocks.current.mockReturnValue({ constructionBundle: '/assets/construction-a.bin' })
  for (const listener of mocks.published) listener()
  expect(mocks.workers[0]!.preparations[0]?.keys).toEqual(['build:', 'units:cat'])
})

it('replaces the worker when the download changes', () => {
  prepared()
  mocks.current.mockReturnValue({ constructionBundle: '/assets/construction-b.bin' })
  start(wounds)
  expect({ workers: mocks.workers.length, stopped: mocks.workers[0]!.terminated }).toEqual({ workers: 2, stopped: true })
})

it('gives up on a download the worker cannot read', () => {
  start(wounds)
  mocks.workers[0]!.message({ unavailable: 'offline' })
  start(wounds)
  expect(mocks.workers.length).toBe(1)
})

it('reports a read the rules cannot answer without stopping the worker', async () => {
  prepared()
  const answer = wounds()!
  mocks.workers[0]!.answer({ error: 'Unknown datasheet' })
  await expect(answer).rejects.toThrow('Unknown datasheet')
  expect(mocks.workers[0]!.terminated).toBe(false)
})

it('stops an idle worker so it does not keep the catalogue in memory', () => {
  vi.useFakeTimers()
  prepared()
  vi.advanceTimersByTime(worker.CONSTRUCTION_WORKER_IDLE_MS)
  expect(mocks.workers[0]!.terminated).toBe(true)
})

it('keeps a worker that is still preparing', () => {
  vi.useFakeTimers()
  start(wounds)
  vi.advanceTimersByTime(worker.CONSTRUCTION_WORKER_IDLE_MS)
  expect(mocks.workers[0]!.terminated).toBe(false)
})

it('keeps a worker that is still answering a read', () => {
  vi.useFakeTimers()
  prepared()
  void wounds()!.catch(() => {})
  vi.advanceTimersByTime(worker.CONSTRUCTION_WORKER_IDLE_MS)
  expect(mocks.workers[0]!.terminated).toBe(false)
})

it('leaves reads to the server once a newer release is published', () => {
  prepared()
  worker.retireDeviceConstruction()
  expect(wounds()).toBeNull()
})

it('stops the worker when a newer release is published', () => {
  prepared()
  worker.retireDeviceConstruction()
  expect(mocks.workers[0]!.terminated).toBe(true)
})
