import path from 'node:path'
import { persistedSecret } from 'ras-stack/auth'
import { globalSingleton } from 'ras-stack/server'
import { type BattleEvents, RealtimePublisher } from '../adapters/events'
import { serverTelemetry } from '../adapters/posthog'
import { catalogueDirectory, type LoadedCatalogue, loadCatalogue } from './catalogueIndex'
import { type LoadedRules, loadRules } from './rules'
import { DEFAULT_CATALOGUE_SNAPSHOT_BASE_URL, fetchCurrentSnapshot, installedSnapshot } from './catalogueSnapshot'
import type { SyncState } from './sync'
import { databasePath, type PraetoriumDatabase, openDatabase } from '../db/connection'
import { Repository } from '../db/repository'
import { createAuth } from './auth'
import { realtimeConfig } from './realtime'
import { PraetoriumService } from './service'

type App = {
  database: PraetoriumDatabase
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
    const baseUrl = process.env.CATALOGUE_SNAPSHOT_BASE_URL || DEFAULT_CATALOGUE_SNAPSHOT_BASE_URL
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
export function warm(instance: Pick<App, 'catalogue' | 'rules'>) {
  setImmediate(() => {
    try {
      instance.catalogue()
      instance.rules()
    } catch (error) {
      sync.state = { status: 'failed', detail: error instanceof Error ? error.message : 'the catalogue could not be loaded' }
    }
  })
}

export function app(): App {
  return globalSingleton('praetorium.app', () => {
    const telemetry = serverTelemetry()
    const file = databasePath()
    const database = openDatabase(file)
    const realtime = realtimeConfig()
    const events = new RealtimePublisher(realtime.apiUrl, realtime.apiKey)
    const instance: App = {
      database,
      service: new PraetoriumService(new Repository(database), Date.now, events),
      events,
      auth: createAuth(database, persistedSecret({ directory: path.dirname(file) })),
      catalogue: memoize(loadCatalogue),
      rules: memoize(loadRules),
      sync: () => sync.state,
      telemetry,
    }
    // Fetched in the background rather than at boot: an instance must start and
    // serve battles whether or not it has the catalogues yet.
    sync.begin(catalogueDirectory(path.dirname(file)), () => {
      instance.catalogue = memoize(loadCatalogue)
      instance.rules = memoize(loadRules)
      warm(instance)
    })
    const catalogueRefresh = setInterval(
      () =>
        sync.begin(catalogueDirectory(path.dirname(file)), () => {
          instance.catalogue = memoize(loadCatalogue)
          instance.rules = memoize(loadRules)
          warm(instance)
        }),
      60 * 60 * 1000,
    )
    catalogueRefresh.unref()
    if (sync.state.status === 'ready') warm(instance)
    return instance
  })
}
