import path from 'node:path'
import { persistedSecret } from 'ras-stack/auth'
import { type BattleEvents, RealtimePublisher } from '../adapters/events'
import { catalogueDirectory, type LoadedCatalogue, loadCatalogue } from './catalogueIndex'
import { type LoadedRules, loadRules } from './rules'
import { isCurrent, type SyncState, syncSources } from './sync'
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
    const authoritativeReady = isCurrent(directory)
    this.running = true
    this.state = authoritativeReady ? { status: 'ready', detail: null } : { status: 'working', detail: 'fetching the community data' }
    void syncSources(directory, (message) => {
      if (!authoritativeReady) this.state = { status: 'working', detail: message }
    })
      .then(() => {
        this.state = { status: 'ready', detail: null }
        onReady()
      })
      .catch((error: unknown) => {
        this.state = { status: 'failed', detail: error instanceof Error ? error.message : 'the fetch failed' }
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

// Dev keeps the instance on globalThis so HMR reloads reuse one SQLite handle.
const globalApp = globalThis as typeof globalThis & { praetoriumApp?: App }

export function app(): App {
  if (!globalApp.praetoriumApp) {
    const file = databasePath()
    const database = openDatabase(file)
    const realtime = realtimeConfig()
    const events = new RealtimePublisher(realtime.apiUrl, realtime.apiKey)
    globalApp.praetoriumApp = {
      database,
      service: new PraetoriumService(new Repository(database), Date.now, events),
      events,
      auth: createAuth(database, persistedSecret({ directory: path.dirname(file) })),
      catalogue: memoize(loadCatalogue),
      rules: memoize(loadRules),
      sync: () => sync.state,
    }
    // Fetched in the background rather than at boot: an instance must start and
    // serve battles whether or not it has the catalogues yet.
    sync.begin(catalogueDirectory(path.dirname(file)), () => {
      globalApp.praetoriumApp = { ...globalApp.praetoriumApp!, catalogue: memoize(loadCatalogue), rules: memoize(loadRules) }
      warm(globalApp.praetoriumApp)
    })
    if (sync.state.status === 'ready') warm(globalApp.praetoriumApp)
  }
  return globalApp.praetoriumApp
}
