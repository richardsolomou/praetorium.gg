import { referenceData } from './runtime'
import { holdsConstruction } from './compressedReference'
import { calculationRead } from './calculationRead'
import { deviceConstructionRead } from './constructionWorker'
import { SERVER_READS, type ConstructionReadData, type ConstructionReadName } from './constructionReads'
import { buildConstruction, constructionSource, runConstructionRead } from './constructionSource'
import type { OfflineConstructionSource } from '../../contracts/offlineReference'
import { TERRAIN_GEOMETRY_VERSION } from '../../contracts/terrainReference'
import type { TerrainLayout, TerrainTemplate } from '../../contracts/terrain'

const cache = new WeakMap<OfflineConstructionSource, ReturnType<typeof buildConstruction>>()

export function constructionData(catalogueId?: string) {
  return constructionSource(referenceData()?.construction, catalogueId)
}

/** Whether the device holds construction data, without the full build `localConstruction` runs on first use. */
export function hasLocalConstruction() {
  return Boolean(referenceData()?.construction)
}

/** `localConstruction()` once something has built it, never building or decoding it: the first build takes about a second on a phone. */
export function builtLocalConstruction() {
  const saved = referenceData()
  return (saved && builtFor.get(saved)) || null
}

/** Builds `localConstruction()` while the page is idle, so an action needing it does not freeze the page to build it. */
export function warmLocalConstruction() {
  const saved = referenceData()
  if (!saved || !holdsConstruction(saved) || builtLocalConstruction()) return () => {}
  let cancelled = false
  let handle = 0
  const idle = (run: () => void) => {
    const guarded = () => void (cancelled || run())
    handle = window.requestIdleCallback ? window.requestIdleCallback(guarded, { timeout: 5_000 }) : window.setTimeout(guarded, 0)
  }
  // Two steps of a few hundred milliseconds each on a phone, so a tap between them is not held up by both.
  idle(() => {
    constructionData()
    idle(() => localConstruction())
  })
  return () => {
    cancelled = true
    if (window.cancelIdleCallback) window.cancelIdleCallback(handle)
    else window.clearTimeout(handle)
  }
}

const builtFor = new WeakMap<object, ReturnType<typeof buildConstruction>>()

export function localConstruction(catalogueId?: string) {
  const saved = constructionData(catalogueId)
  if (!saved) return null
  const existing = cache.get(saved)
  if (existing) {
    if (!catalogueId) builtFor.set(referenceData()!, existing)
    return existing
  }
  const built = buildConstruction(saved)
  const terrain =
    referenceData()
      ?.queries?.filter(({ key }) => key[0] === 'terrain-references' && key[1] === TERRAIN_GEOMETRY_VERSION)
      .map(({ data }) => data as { layouts: TerrainLayout[]; templates: TerrainTemplate[] }) ?? []
  if (terrain.length) {
    built.rules.terrainLayouts = [
      ...new Map(terrain.flatMap(({ layouts }) => layouts.map((layout) => [layout.id, layout] as const))).values(),
    ]
    built.rules.terrainTemplates = [
      ...new Map(terrain.flatMap(({ templates }) => templates.map((template) => [template.id, template] as const))).values(),
    ]
  }
  cache.set(saved, built)
  if (!catalogueId) builtFor.set(referenceData()!, built)
  return built
}

/**
 * A read the server answers and the device can answer from construction data, which returns what the server would.
 * A device that has prepared the read answers it, online or not; otherwise the server does, or the downloaded rules on
 * this thread when the server cannot.
 */
export function constructionRead<K extends ConstructionReadName, T>(
  name: K,
  data: ConstructionReadData<K>,
  online: (signal?: AbortSignal) => Promise<T>,
  catalogueId?: string,
  signal?: AbortSignal,
): Promise<T> {
  const remote = () =>
    calculationRead(
      online,
      (error) => {
        const construction = localConstruction(catalogueId)
        if (construction) return runConstructionRead(name, construction, data) as T
        throw error ?? new Error('Download this army’s rules online before using them offline.')
      },
      signal,
    )
  const device = typeof window === 'undefined' || SERVER_READS.has(name) ? null : deviceConstructionRead(name, data, catalogueId)
  if (!device) return remote()
  return untilAborted(device as Promise<T>, signal).catch(() => {
    signal?.throwIfAborted()
    return remote()
  })
}

function untilAborted<T>(answer: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return answer
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    answer.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
