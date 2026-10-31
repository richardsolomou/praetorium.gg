import { loadSavedQuery, partsReachable, referenceData, subscribeReference } from './runtime'
import { readPart } from './referenceStore'
import { calculationRead } from './calculationRead'
import { deviceConstructionRead } from './constructionWorker'
import { SERVER_READS, type ConstructionReadData, type ConstructionReadName } from './constructionReads'
import { buildConstruction, constructionSource, loadConstructionData, runConstructionRead } from './constructionSource'
import { MAX_REFERENCE_PART_BYTES, type OfflineConstructionRules, type OfflineReferenceData } from '../../contracts/offlineReference'
import { unpackRuntimeData } from '../../contracts/runtimeData'
import { TERRAIN_GEOMETRY_VERSION, terrainMatchupIds } from '../../contracts/terrainReference'
import type { TerrainLayout, TerrainTemplate } from '../../contracts/terrain'
import type { LoadedRules } from '../../shared/rules'
import { sideDisposition, type BattleState } from '../../core/battle'
import { catalogueEditionId } from '../../core/catalogueEdition'

/** Whether the device holds construction data, which every saved download carries, without decoding any. */
export const hasLocalConstruction = () => Boolean(referenceData())

type LocalRules = { revision: string; rules: LoadedRules }
let rules: { download: OfflineReferenceData['download']; value: Promise<LocalRules | null>; loaded?: LocalRules | null } | null = null

/**
 * The current rules battles on this device are validated with, decoded from the download's rules part alone: battles
 * never read catalogues. Without terrain layouts, which `battleRules` adds for one battle.
 */
export function loadLocalRules(): Promise<LocalRules | null> {
  const saved = referenceData()
  if (!saved) return Promise.resolve(null)
  if (rules?.download !== saved.download) {
    const loading: NonNullable<typeof rules> = {
      download: saved.download,
      value: readPart(saved.download.construction.rules, MAX_REFERENCE_PART_BYTES, partsReachable()).then(
        (part) => {
          const { revision, rules: packed } = part as OfflineConstructionRules
          return { revision, rules: unpackRuntimeData<LoadedRules>(packed) }
        },
        () => null,
      ),
    }
    void loading.value.then((value) => {
      loading.loaded = value
      // A failed read is tried again by the next command rather than refusing every one.
      if (!value && rules === loading) rules = null
    })
    rules = loading
  }
  return rules.value
}

/** `loadLocalRules()` once settled, never loading it: undefined until then, null when the rules could not be read. */
export function localRules() {
  const saved = referenceData()
  return saved && rules?.download === saved.download ? rules.loaded : undefined
}

/** Loads the battle rules once the page has a download, so the first command does not wait for them. */
export function warmLocalRules() {
  const warm = () => void loadLocalRules()
  const handle = window.setTimeout(warm, 0)
  const unsubscribe = subscribeReference(warm)
  return () => {
    window.clearTimeout(handle)
    unsubscribe()
  }
}

/** The current rules with the terrain layouts of a battle's matchup, which its setup is validated against. */
export async function battleRules(state: BattleState): Promise<LocalRules | null> {
  const loaded = await loadLocalRules()
  if (!loaded) return null
  const sides = [...new Set(state.players.map((player) => player.side))].toSorted((left, right) => left - right)
  const matchups = terrainMatchupIds(sides.flatMap((side) => sideDisposition(state, side) ?? []))
  const terrain = matchups.length
    ? await loadSavedQuery<{ layouts: TerrainLayout[]; templates: TerrainTemplate[] }>(referenceData(), [
        'terrain-references',
        TERRAIN_GEOMETRY_VERSION,
        ...matchups,
      ])
    : undefined
  return terrain ? { ...loaded, rules: { ...loaded.rules, terrainLayouts: terrain.layouts, terrainTemplates: terrain.templates } } : loaded
}

type Built = ReturnType<typeof buildConstruction>
let local: {
  download: OfflineReferenceData['download']
  parts: Map<string, Promise<unknown>>
  built: Map<string, { value: Promise<Built | null>; loaded?: Built | null }>
} | null = null

/**
 * A rules version's catalogues and rules decoded on this thread, for offline work the construction worker has not
 * prepared. Each version builds once per download, decoding the current rules' catalogues once for all of them.
 */
export function localConstruction(catalogueId?: string): Promise<Built | null> {
  const saved = referenceData()
  if (!saved) return Promise.resolve(null)
  if (local?.download !== saved.download) local = { download: saved.download, parts: new Map(), built: new Map() }
  const { parts, built } = local
  const key = (catalogueId && catalogueEditionId(catalogueId)) ?? ''
  const existing = built.get(key)
  if (existing) return existing.value
  const read = (asset: string, limit: number) => {
    let part = parts.get(asset)
    if (!part) {
      parts.set(asset, (part = readPart(asset, limit, partsReachable())))
      part.catch(() => parts.delete(asset))
    }
    return part
  }
  const entry: { value: Promise<Built | null>; loaded?: Built | null } = {
    value: loadConstructionData(saved.download.construction, catalogueId, read)
      .then((data) => {
        const source = constructionSource(data, catalogueId)
        return source ? buildConstruction(source) : null
      })
      .catch(() => null),
  }
  void entry.value.then((value) => {
    entry.loaded = value
    if (!value) built.delete(key)
  })
  built.set(key, entry)
  return entry.value
}

/** `localConstruction(catalogueId)` once it has built, never building it. */
export function builtConstruction(catalogueId?: string) {
  const saved = referenceData()
  return (
    (saved && local?.download === saved.download && local.built.get((catalogueId && catalogueEditionId(catalogueId)) ?? '')?.loaded) || null
  )
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
      async (error) => {
        const construction = await localConstruction(catalogueId)
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
