import path from 'node:path'
import { type BattleEvents, createBattleEvents } from '../adapters/events'
import { catalogueDirectory, type LoadedCatalogue, loadCatalogue } from './catalogue'
import { type LoadedRules, loadRules } from './rules'
import { isCurrent, type SyncState, syncSources } from './sync'
import { databasePath, type MusterDatabase, openDatabase } from '../db/connection'
import { Repository } from '../db/repository'
import { sessionSecret } from './identity'
import { Presence } from './presence'
import { MusterService } from './service'

type App = {
  database: MusterDatabase
  service: MusterService
  events: BattleEvents
  presence: Presence
  secret: string
  /** Loaded on first use, and null on an instance with no catalogue data synced. */
  catalogue: () => LoadedCatalogue | null
  /** Stratagems and mission cards, null when that source has not been synced. */
  rules: () => LoadedRules | null
  /** How the community data is doing, so the interface can say rather than guess. */
  sync: () => SyncState
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
 * Kept outside the app so a reload during development does not start a second
 * download of the same 60MB.
 */
const sync = {
  state: { status: 'absent', detail: null } as SyncState,
  running: false,
  begin(directory: string, onReady: () => void) {
    if (this.running || isCurrent(directory)) {
      this.state = isCurrent(directory) ? { status: 'ready', detail: null } : this.state
      return
    }
    this.running = true
    this.state = { status: 'working', detail: 'fetching the community data' }
    void syncSources(directory, (message) => {
      this.state = { status: 'working', detail: message }
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

// Dev keeps the instance on globalThis so HMR reloads reuse one SQLite handle.
const globalApp = globalThis as typeof globalThis & { musterApp?: App }

export function app(): App {
  if (!globalApp.musterApp) {
    const file = databasePath()
    const database = openDatabase(file)
    const events = createBattleEvents()
    globalApp.musterApp = {
      database,
      service: new MusterService(new Repository(database), Date.now, events),
      events,
      presence: new Presence(),
      secret: sessionSecret(path.dirname(file)),
      catalogue: memoize(loadCatalogue),
      rules: memoize(loadRules),
      sync: () => sync.state,
    }
    // Fetched in the background rather than at boot: an instance must start and
    // serve battles whether or not it has the catalogues yet.
    sync.begin(catalogueDirectory(path.dirname(file)), () => {
      globalApp.musterApp = { ...globalApp.musterApp!, catalogue: memoize(loadCatalogue), rules: memoize(loadRules) }
    })
  }
  return globalApp.musterApp
}
