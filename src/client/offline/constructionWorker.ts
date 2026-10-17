// eslint-disable-next-line import/default
import ConstructionWorker from './construction.worker?worker'
import type { ConstructionWorkerAnswer, ConstructionWorkerRequest } from './construction.worker'
import type { ConstructionReadData, ConstructionReadName, ConstructionReadResult } from './constructionReads'
import { catalogueEditionId } from '../../core/catalogueEdition'
import { currentReference, offlineData, subscribePublishedReferenceRevision } from './runtime'

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

/** A worker holds the whole catalogue, so one left idle this long is stopped and rebuilt by the next read. */
export const CONSTRUCTION_WORKER_IDLE_MS = 3 * 60_000

/** Reads that list a faction's whole picker, which the worker prepares once per faction. */
const UNIT_READS = new Set<ConstructionReadName>(['units', 'booksOffering'])

type Running = {
  url: string
  worker: Worker
  pending: Map<number, Pending>
  /** Preparations, by `preparation` key, the worker has finished or is working on. */
  ready: Set<string>
  preparing: Set<string>
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

/** Stops device construction once a newer release is published: this page's rules code may no longer match the server's. */
export function retireDeviceConstruction() {
  outdated = true
  wanted.clear()
  stop(new Error('A newer release is published'))
}

function stop(error: Error) {
  if (!running) return
  clearTimeout(running.idle)
  running.worker.terminate()
  for (const { reject } of running.pending.values()) reject(error)
  running = null
}

function deviceDownload() {
  const url = currentReference()?.constructionBundle
  return url && !outdated && !offlineData() && !unavailable.has(url) ? url : null
}

/**
 * Answers a construction read in a worker holding the downloaded construction data, once the worker has prepared
 * what the read needs. Otherwise returns null, so the server answers alone, and starts that preparation for the next
 * read: nothing is calculated twice.
 */
export function deviceConstructionRead<K extends ConstructionReadName>(
  name: K,
  data: ConstructionReadData<K>,
  catalogueId?: string,
): Promise<ConstructionReadResult<K>> | null {
  const units = UNIT_READS.has(name)
  const url = deviceDownload()
  const current = url && running?.url === url ? running : null
  if (!current || !preparation(catalogueId, units).every((key) => current.ready.has(key))) {
    prepareDeviceConstruction(catalogueId, units)
    return null
  }
  const id = nextId++
  clearTimeout(current.idle)
  return new Promise<ConstructionReadResult<K>>((resolve, reject) => {
    current.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    current.worker.postMessage({ kind: 'read', id, url: current.url, name, data, catalogueId } satisfies ConstructionWorkerRequest)
  })
}

/**
 * Prepares construction data on the device, and a faction's picker for `units`, ahead of the reads that need them.
 * Asked before the download is known to be current, it starts once the service confirms it.
 */
export function prepareDeviceConstruction(catalogueId?: string, units = false) {
  // Preparing offline would fail to fetch the download and give up on it for the session.
  if (typeof Worker === 'undefined' || outdated || !navigator.onLine) return
  const url = deviceDownload()
  if (!url) {
    want(catalogueId, units)
    return
  }
  const current = workerFor(url)
  const keys = preparation(catalogueId, units).filter((key) => !current.ready.has(key) && !current.preparing.has(key))
  if (!keys.length) return
  for (const key of keys) current.preparing.add(key)
  clearTimeout(current.idle)
  current.worker.postMessage({ kind: 'prepare', url, catalogueId, units, keys } satisfies ConstructionWorkerRequest)
}

function want(catalogueId: string | undefined, units: boolean) {
  wanted.set(preparation(catalogueId, units).join(' '), { catalogueId, units })
  if (watching) return
  watching = true
  subscribePublishedReferenceRevision(() => {
    if (!deviceDownload()) return
    const asked = [...wanted.values()]
    wanted.clear()
    for (const request of asked) prepareDeviceConstruction(request.catalogueId, request.units)
  })
}

function rest(current: Running) {
  clearTimeout(current.idle)
  if (!current.pending.size && !current.preparing.size)
    current.idle = setTimeout(() => running === current && stop(new Error('The construction worker was idle')), CONSTRUCTION_WORKER_IDLE_MS)
}

function workerFor(url: string): Running {
  if (running?.url === url) return running
  stop(new Error('The construction download changed'))
  const worker = new ConstructionWorker()
  const current: Running = { url, worker, pending: new Map(), ready: new Set(), preparing: new Set() }
  worker.onmessage = ({ data: answer }: MessageEvent<ConstructionWorkerAnswer>) => {
    if ('unavailable' in answer) {
      unavailable.add(url)
      if (running === current) stop(new Error(answer.unavailable))
      return
    }
    if ('prepared' in answer || 'unprepared' in answer) {
      for (const key of 'prepared' in answer ? answer.prepared : answer.unprepared) {
        current.preparing.delete(key)
        if ('prepared' in answer) current.ready.add(key)
      }
      return rest(current)
    }
    const pending = current.pending.get(answer.id)
    current.pending.delete(answer.id)
    rest(current)
    if ('error' in answer) pending?.reject(new Error(answer.error))
    else pending?.resolve(answer.value)
  }
  worker.onerror = () => {
    unavailable.add(url)
    if (running === current) stop(new Error('The construction worker failed'))
  }
  running = current
  return current
}
