import '../polyfills'
import { readPart } from './referenceStore'
import { buildConstruction, constructionSource, loadConstructionData, runConstructionRead } from './constructionSource'
import { constructionReadEvents, type ConstructionReadEvent, type ConstructionReadName } from './constructionReads'
import type { OfflineConstructionSource, OfflineReferenceVersion } from '../../contracts/offlineReference'
import { pickerConstruction } from '../../shared/pickerUnits'
import { combatLoadoutCandidates } from '../../shared/combatLoadouts'
import { combatLoadoutSchema } from '../../contracts/schemas'
import type { LoadoutBatch } from '../../core/combatLoadouts'
import { nextTask } from '../../shared/nextTask'

/**
 * The download the worker reads construction data from, by absolute address because an inline worker resolves
 * relative ones against its `blob:` URL; `id` names the download, so a page starts a new worker when it changes.
 */
export type ConstructionWorkerSource = { id: string; parts: OfflineReferenceVersion['construction'] }

export type ConstructionWorkerRequest =
  | { kind: 'read'; id: number; name: ConstructionReadName; data: unknown; catalogueId?: string }
  | { kind: 'prepare'; source: ConstructionWorkerSource; catalogueId?: string; units: boolean; keys: string[] }
  | { kind: 'search'; id: number; source: ConstructionWorkerSource; input: unknown; catalogueId: string }
  | { kind: 'next'; id: number }
  | { kind: 'stop'; id: number }
export type ConstructionWorkerAnswer =
  | { id: number; value: unknown; event?: ConstructionReadEvent }
  | { id: number; batch: LoadoutBatch }
  | { id: number; done: true }
  | { id: number; error: string }
  | { prepared: string[] }
  | { unprepared: string[] }
  | { unavailable: string }

const PREPARATION_SLICE_MS = 8

let source: ConstructionWorkerSource | undefined
const parts = new Map<string, Promise<unknown>>()
const built = new WeakMap<OfflineConstructionSource, ReturnType<typeof buildConstruction>>()
const searches = new Map<number, { batches: ReturnType<typeof combatLoadoutCandidates>; controller: AbortController }>()

class Unavailable extends Error {}

const post = (answer: ConstructionWorkerAnswer) => self.postMessage(answer)

/** Decodes each part once; a part the device has not stored is read from the service while connected. */
function part(asset: string, limit: number) {
  let decoded = parts.get(asset)
  if (!decoded) {
    parts.set(asset, (decoded = readPart(asset, limit, navigator.onLine)))
    decoded.catch(() => parts.delete(asset))
  }
  return decoded
}

async function construction(catalogueId?: string) {
  if (!source) throw new Error('The construction data has not been loaded.')
  const { parts: download } = source
  const data = await loadConstructionData(download, catalogueId, (asset, limit) =>
    part(asset, limit).catch((error: unknown) => {
      // Without the current rules nothing can be answered here; another version's part only fails its own reads.
      throw asset === download.catalogue || asset === download.rules ? new Unavailable(String(error)) : error
    }),
  )
  const saved = constructionSource(data, catalogueId)
  if (!saved) throw new Error('This rules version is not in the download')
  let prepared = built.get(saved)
  if (!prepared) built.set(saved, (prepared = buildConstruction(saved)))
  return prepared
}

const failed = (error: unknown) => {
  if (error instanceof Unavailable) post({ unavailable: error.message })
}

/** Builds a rules version's construction data and, for `units`, prepares a faction's picker a datasheet per step. */
async function prepare({ catalogueId, units, keys }: Extract<ConstructionWorkerRequest, { kind: 'prepare' }>) {
  try {
    const { catalogue, rules } = await construction(catalogueId)
    if (units && catalogueId) {
      const steps = pickerConstruction(catalogue, rules, catalogueId)
      // Yielding once per slice lets reads already prepared be answered meanwhile.
      let slice = performance.now()
      while (!steps.next().done) {
        if (performance.now() - slice < PREPARATION_SLICE_MS) continue
        await nextTask()
        slice = performance.now()
      }
    }
    post({ prepared: keys })
  } catch (error) {
    post({ unprepared: keys })
    failed(error)
  }
}

async function read({ id, name, data, catalogueId }: Extract<ConstructionWorkerRequest, { kind: 'read' }>) {
  const prepared = await construction(catalogueId)
  const startedAt = performance.now()
  const value = runConstructionRead(name, prepared, data as never)
  const event = constructionReadEvents[name]?.(prepared, data as never, value as never)
  const duration_ms = Math.round(performance.now() - startedAt)
  post({ id, value, ...(event ? { event: { ...event, properties: { ...event.properties, duration_ms } } } : {}) })
}

/** Sends a loadout search's next batch of candidates, as the page asks for them. */
async function next(id: number) {
  const running = searches.get(id)
  if (!running) throw new Error('The loadout search has not started.')
  const step = await running.batches.next()
  if (step.done) searches.delete(id)
  post(step.done ? { id, done: true } : { id, batch: step.value })
}

async function search({ id, input, catalogueId }: Extract<ConstructionWorkerRequest, { kind: 'search' }>) {
  const { catalogue, rules } = await construction(catalogueId)
  const controller = new AbortController()
  searches.set(id, { batches: combatLoadoutCandidates(catalogue, combatLoadoutSchema.parse(input), controller.signal, rules), controller })
  await next(id)
}

self.onmessage = async ({ data: request }: MessageEvent<ConstructionWorkerRequest>) => {
  if ('source' in request) source ??= request.source
  if (request.kind === 'prepare') return prepare(request)
  if (request.kind === 'stop') {
    searches.get(request.id)?.controller.abort()
    searches.delete(request.id)
    return
  }
  try {
    if (request.kind === 'read') await read(request)
    else if (request.kind === 'search') await search(request)
    else await next(request.id)
  } catch (error) {
    searches.delete(request.id)
    failed(error)
    post({ id: request.id, error: error instanceof Error ? error.message : String(error) })
  }
}
