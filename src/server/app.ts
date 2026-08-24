import path from 'node:path'
import { randomInt } from 'node:crypto'
import { persistedSecret } from 'ras-stack/auth'
import { globalSingleton } from 'ras-stack/server'
import { type BattleEvents, RealtimePublisher } from '../adapters/events'
import { serverTelemetry } from '../adapters/posthog'
import { catalogueDirectory, type LoadedCatalogue, loadCatalogue } from './catalogueIndex'
import { type LoadedRules, loadRules } from './rules'
import { fetchCurrentSnapshot, installedSnapshot } from './catalogueSnapshot'
import { DEFAULT_S3_PUBLIC_BASE_URL } from './objectStorage'
import type { SyncState } from './sync'
import { databaseUrl, type PraetoriumDatabase, openDatabase } from '../db/connection'
import { Repository } from '../db/repository'
import { createAuth } from './auth'
import { realtimeConfig } from '../adapters/realtime'
import { openValkey, type ValkeyClient, valkeySecondaryStorage, valkeyUrl } from '../adapters/valkey'
import { PraetoriumService } from './service'

type App = {
  database: PraetoriumDatabase
  /** Null on a single-replica instance, which needs none of it. */
  valkey: ValkeyClient | null
  service: PraetoriumService
  events: BattleEvents
  /** Loaded on first use, and null on an instance with no catalogue data synced. */
  catalogue: () => LoadedCatalogue | null
  /** Stratagems and mission cards, null when that source has not been synced. */
  rules: () => LoadedRules | null
  /** How the community data is doing, so the interface can say rather than guess. */
  sync: () => SyncState
  auth: ReturnType<typeof createAuth>
  telemetry: ReturnType<typeof serverTelemetry>
  /** Resolves after installed catalogue data has paid its one-time parse cost. */
  ready: () => Promise<void>
}

/** Parsing the whole catalogue takes seconds, so it happens once and only if asked for. */
function memoize<T>(work: () => T): () => T {
  let done = false
  let value: T
  return () => {
    if (!done) {
      value = work()
      done = true
    }
    return value
  }
}

/**
 * The one sync in flight, if any.
 *
 * Kept outside the app so a reload during development does not start the same
 * download twice.
 */
const sync = {
  state: { status: 'absent', detail: null } as SyncState,
  running: false,
  begin(directory: string, onReady: () => void) {
    if (this.running) return
    const authoritativeReady = Boolean(installedSnapshot(directory))
    const baseUrl = process.env.S3_PUBLIC_BASE_URL || DEFAULT_S3_PUBLIC_BASE_URL
    this.running = true
    this.state = authoritativeReady ? { status: 'ready', detail: null } : { status: 'working', detail: 'fetching the community data' }
    void fetchCurrentSnapshot(directory, baseUrl, (message) => {
      if (!authoritativeReady) this.state = { status: 'working', detail: message }
    })
      .then(() => {
        this.state = { status: 'ready', detail: null }
        onReady()
      })
      .catch((error: unknown) => {
        this.state = authoritativeReady
          ? { status: 'ready', detail: null }
          : { status: 'failed', detail: error instanceof Error ? error.message : 'the fetch failed' }
      })
      .finally(() => {
        this.running = false
      })
  },
}

/** Pays the one-time parse cost after startup, before a player opens the catalogue. */
export function warm(instance: Pick<App, 'catalogue' | 'rules'>): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        instance.catalogue()
        instance.rules()
      } catch (error) {
        sync.state = { status: 'failed', detail: error instanceof Error ? error.message : 'the catalogue could not be loaded' }
      }
      resolve()
    })
  })
}

export function app(): App {
  return globalSingleton('praetorium.app', () => {
    const telemetry = serverTelemetry()
    // Secrets and the catalogue cache still live on disk; only the game data moved.
    const dataDirectory = path.resolve(process.env.DATA_DIR ?? '/data')
    const { database } = openDatabase(databaseUrl())
    const valkey = valkeyUrl()
    const cache = valkey ? openValkey(valkey) : null
    const realtime = realtimeConfig()
    const events = new RealtimePublisher(realtime.apiUrl, realtime.apiKey)
    let ready = Promise.resolve()
    const instance: App = {
      database,
      valkey: cache,
      service: new PraetoriumService(new Repository(database), Date.now, events, randomInt),
      events,
      auth: createAuth(database, persistedSecret({ directory: dataDirectory }), cache ? valkeySecondaryStorage(cache) : undefined),
      catalogue: memoize(loadCatalogue),
      rules: memoize(loadRules),
      sync: () => sync.state,
      telemetry,
      ready: () => ready,
    }
    // Fetched in the background rather than at boot: an instance must start and
    // serve battles whether or not it has the catalogues yet.
    sync.begin(catalogueDirectory(dataDirectory), () => {
      instance.catalogue = memoize(loadCatalogue)
      instance.rules = memoize(loadRules)
      ready = warm(instance)
    })
    const catalogueRefresh = setInterval(
      () =>
        sync.begin(catalogueDirectory(dataDirectory), () => {
          instance.catalogue = memoize(loadCatalogue)
          instance.rules = memoize(loadRules)
          ready = warm(instance)
        }),
      60 * 60 * 1000,
    )
    catalogueRefresh.unref()
    if (sync.state.status === 'ready') ready = warm(instance)
    return instance
  })
}
