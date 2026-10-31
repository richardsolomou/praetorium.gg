import type { ConstructionWorkerAnswer, ConstructionWorkerRequest, ConstructionWorkerSource } from './construction.worker'
import type { ConstructionReadData, ConstructionReadEvent, ConstructionReadName, ConstructionReadResult } from './constructionReads'
import { posthog } from 'posthog-js'
import { catalogueEditionId } from '../../core/catalogueEdition'
import { currentReference, offlineData, referenceData, subscribeReference } from './runtime'

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }
type Waiter = { keys: string[]; resolve: () => void; reject: (error: Error) => void }

/** A worker holds the whole catalogue, so one left idle this long is stopped and rebuilt by the next read. */
export const CONSTRUCTION_WORKER_IDLE_MS = 3 * 60_000

/** Reads that list a faction's whole picker, which the worker prepares once per faction. */
const UNIT_READS = new Set<ConstructionReadName>(['units', 'booksOffering'])

type Running = {
  id: string
  /** Loaded on first use, inline so the saved offline application carries it; messages wait in `queue` until then. */
  worker: Worker | null
  queue: ConstructionWorkerRequest[]
  pending: Map<number, Pending>
  /** Preparations, by `preparation` key, the worker has finished. */
  ready: Set<string>
  /** Preparations the worker is working on. */
  preparing: Set<string>
  waiters: Waiter[]
  idle?: ReturnType<typeof setTimeout>
}

let running: Running | null = null
const unavailable = new Set<string>()
/** Preparations asked for before the download was known to be current, started once it is. */
const wanted = new Map<string, { catalogueId?: string; units: boolean }>()
let nextId = 0
let outdated = false
let watching = false

const buildKey = (catalogueId?: string) => `build:${(catalogueId && catalogueEditionId(catalogueId)) ?? ''}`
/** What a read needs prepared: its rules version's construction data, and for unit reads its faction's picker. */
const preparation = (catalogueId: string | undefined, units: boolean) =>
  units && catalogueId ? [buildKey(catalogueId), `units:${catalogueId}`] : [buildKey(catalogueId)]

/** Whether the server can answer instead; otherwise the device is all there is, so a read waits for it to prepare. */
const connected = () => navigator.onLine && !offlineData()

/** Stops device construction once a newer release is published: this page's rules code may no longer match the server's. */
export function retireDeviceConstruction() {
  outdated = true
  wanted.clear()
  stop(new Error('A newer release is published'))
}

function markUnavailable(id: string, reason: 'refused' | 'crashed' | 'load_failed') {
  if (!unavailable.has(id)) posthog.capture('offline_construction_unavailable', { reason })
  unavailable.add(id)
}

function stop(error: Error) {
  if (!running) return
  clearTimeout(running.idle)
  running.worker?.terminate()
  for (const { reject } of running.pending.values()) reject(error)
  for (const { reject } of running.waiters) reject(error)
  running = null
}

/**
 * The construction data the worker may answer from. Connected, it is the download the service still publishes;
 * disconnected, it is whatever the page holds.
 */
function deviceSource(): ConstructionWorkerSource | null {
  if (typeof Worker === 'undefined' || outdated) return null
  const saved = connected() ? currentReference() : referenceData()
  if (!saved || unavailable.has(saved.download.revision)) return null
  const { catalogue, rules, editions } = saved.download.construction
  const absolute = (asset: string) => new URL(asset, location.href).href
  return {
    id: saved.download.revision,
    parts: {
      catalogue: absolute(catalogue),
      rules: absolute(rules),
      editions: Object.fromEntries(Object.entries(editions).map(([id, asset]) => [id, absolute(asset)])),
    },
  }
}

/**
 * Answers a construction read in a worker holding the downloaded construction data, once the worker has prepared
 * what the read needs. Connected, an unprepared read returns null, so the server answers alone, and starts that
 * preparation for the next read: nothing is calculated twice. Disconnected, the read waits for the preparation.
 */
export function deviceConstructionRead<K extends ConstructionReadName>(
  name: K,
  data: ConstructionReadData<K>,
  catalogueId?: string,
): Promise<ConstructionReadResult<K>> | null {
  const units = UNIT_READS.has(name)
  const source = deviceSource()
  const keys = preparation(catalogueId, units)
  const current = source && running?.id === source.id ? running : null
  const ask = () => {
    const id = nextId++
    return call<ConstructionReadResult<K>>(workerFor(source!), id, { kind: 'read', id, name, data, catalogueId })
  }
  if (current && keys.every((key) => current.ready.has(key))) return ask()
  // Connected, only the roster builder's picker starts preparing: a rules version's catalogues cost a phone more
  // memory than a page such as a battle, which the server answers, should spend on them.
  if (units || (source && !connected())) prepareDeviceConstruction(catalogueId, units)
  if (!source || connected()) return null
  return prepared(workerFor(source), keys).then(ask)
}

/**
 * Prepares construction data on the device, and a faction's picker for `units`, ahead of the reads that need them.
 * Asked before the download is known to be current, it starts once the service confirms it.
 */
export function prepareDeviceConstruction(catalogueId?: string, units = false) {
  const source = deviceSource()
  if (!source) {
    if (!outdated) want(catalogueId, units)
    return
  }
  const current = workerFor(source)
  const keys = preparation(catalogueId, units).filter((key) => !current.ready.has(key) && !current.preparing.has(key))
  if (!keys.length) return
  for (const key of keys) current.preparing.add(key)
  send(current, { kind: 'prepare', source, catalogueId, units, keys })
}

/**
 * Streams a loadout search's candidate batches from the worker as newline-delimited JSON, as the page reads them.
 * The search runs on the device whenever it holds construction data, waiting for it to load, because the service
 * would otherwise run the same search; null without any.
 */
export function deviceLoadoutSearch(input: { catalogueId: string }, signal: AbortSignal): Response | null {
  const source = deviceSource()
  if (!source) return null
  const current = workerFor(source)
  prepareDeviceConstruction(input.catalogueId)
  const ready = prepared(current, preparation(input.catalogueId, false))
  const encoder = new TextEncoder()
  const id = nextId++
  let started = false
  const cancel = () => {
    if (started) send(current, { kind: 'stop', id })
  }
  signal.addEventListener('abort', cancel, { once: true })
  const stream = new ReadableStream<Uint8Array>({
    async pull(output) {
      try {
        await ready
        signal.throwIfAborted()
        const message: ConstructionWorkerRequest = started
          ? { kind: 'next', id }
          : { kind: 'search', id, source, input, catalogueId: input.catalogueId }
        started = true
        const answer = await call<{ batch: unknown } | { done: true }>(current, id, message)
        signal.throwIfAborted()
        if ('done' in answer) {
          signal.removeEventListener('abort', cancel)
          output.close()
        } else output.enqueue(encoder.encode(`${JSON.stringify(answer.batch)}\n`))
      } catch (error) {
        signal.removeEventListener('abort', cancel)
        cancel()
        output.error(error)
      }
    },
    cancel,
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
}

function want(catalogueId: string | undefined, units: boolean) {
  wanted.set(preparation(catalogueId, units).join(' '), { catalogueId, units })
  if (watching) return
  watching = true
  subscribeReference(() => {
    if (!deviceSource()) return
    const asked = [...wanted.values()]
    wanted.clear()
    for (const request of asked) prepareDeviceConstruction(request.catalogueId, request.units)
  })
}

/** Records the event the server would have recorded for a read the device answered: sampled alike, signed in only. */
function record(event: ConstructionReadEvent | undefined) {
  if (!event || (event.sampleRate !== undefined && Math.random() >= event.sampleRate)) return
  if (posthog.get_property('$user_state') === 'identified') posthog.capture(event.name, event.properties)
}

/** Resolves once the worker has prepared every key, or rejects once it cannot. */
function prepared(current: Running, keys: string[]) {
  if (keys.every((key) => current.ready.has(key))) return Promise.resolve()
  return new Promise<void>((resolve, reject) => current.waiters.push({ keys, resolve, reject }))
}

/** Sends a request and resolves with the worker's answer to `id`: a read's value, or a search's next batch. */
function call<T>(current: Running, id: number, message: ConstructionWorkerRequest) {
  return new Promise<T>((resolve, reject) => {
    current.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    send(current, message)
  })
}

function send(current: Running, message: ConstructionWorkerRequest) {
  clearTimeout(current.idle)
  if (current.worker) current.worker.postMessage(message)
  else current.queue.push(message)
}

function rest(current: Running) {
  clearTimeout(current.idle)
  if (!current.pending.size && !current.preparing.size)
    current.idle = setTimeout(() => running === current && stop(new Error('The construction worker was idle')), CONSTRUCTION_WORKER_IDLE_MS)
}

function settle(current: Running) {
  current.waiters = current.waiters.filter((waiter) => {
    if (waiter.keys.every((key) => current.ready.has(key))) waiter.resolve()
    else if (waiter.keys.some((key) => !current.ready.has(key) && !current.preparing.has(key)))
      waiter.reject(new Error('The construction data could not be prepared'))
    else return true
    return false
  })
}

function answered(current: Running, answer: ConstructionWorkerAnswer) {
  if ('unavailable' in answer) {
    markUnavailable(current.id, 'refused')
    if (running === current) stop(new Error(answer.unavailable))
    return
  }
  if ('prepared' in answer || 'unprepared' in answer) {
    for (const key of 'prepared' in answer ? answer.prepared : answer.unprepared) {
      current.preparing.delete(key)
      if ('prepared' in answer) current.ready.add(key)
    }
    settle(current)
    return rest(current)
  }
  const pending = current.pending.get(answer.id)
  current.pending.delete(answer.id)
  rest(current)
  if ('error' in answer) return pending?.reject(new Error(answer.error))
  if ('value' in answer) {
    record(answer.event)
    return pending?.resolve(answer.value)
  }
  pending?.resolve(answer)
}

function workerFor(source: ConstructionWorkerSource): Running {
  if (running?.id === source.id) return running
  stop(new Error('The construction download changed'))
  const current: Running = {
    id: source.id,
    worker: null,
    queue: [],
    pending: new Map(),
    ready: new Set(),
    preparing: new Set(),
    waiters: [],
  }
  running = current
  void import('./construction.worker?worker&inline').then(
    ({ default: ConstructionWorker }) => {
      if (running !== current) return
      const worker = new ConstructionWorker()
      worker.onmessage = ({ data }: MessageEvent<ConstructionWorkerAnswer>) => answered(current, data)
      worker.onerror = () => {
        markUnavailable(current.id, 'crashed')
        if (running === current) stop(new Error('The construction worker failed'))
      }
      current.worker = worker
      for (const message of current.queue.splice(0)) worker.postMessage(message)
    },
    () => {
      markUnavailable(current.id, 'load_failed')
      if (running === current) stop(new Error('The construction worker could not load'))
    },
  )
  return current
}
