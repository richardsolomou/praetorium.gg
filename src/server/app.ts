import path from 'node:path'
import { randomInt } from 'node:crypto'
import { persistedSecret } from 'ras-stack/auth'
import { globalSingleton } from 'ras-stack/server'
import { type BattleEvents, RealtimePublisher } from '../adapters/events'
import { serverTelemetry } from '../adapters/posthog'
import { catalogueDirectory, type LoadedCatalogue, loadCatalogue } from './catalogueIndex'
import { type LoadedRules, loadRules } from './rules'
import {
  catalogueBaseUrl,
  catalogueLock,
  catalogueUpdateMode,
  fetchCurrentSnapshot,
  fetchPinnedSnapshot,
  installSnapshotArchive,
  installedSnapshot,
} from './catalogueSnapshot'
import type { SyncState } from './sync'
import { databaseUrl, type PraetoriumDatabase, openDatabase } from '../db/connection'
import { Repository } from '../db/repository'
import { createAuth } from './auth'
import { realtimeConfig } from '../adapters/realtime'
import { openValkey, type ValkeyClient, valkeySecondaryStorage, valkeyUrl } from '../adapters/valkey'
import { PraetoriumService } from './service'
import { emailDelivery } from '../adapters/email'
import { prepareGlobalSearch } from './globalSearch'
import { loadCanonicalCatalogue } from './canonicalCatalogue'
import type { CanonicalCatalogue } from '../contracts/catalogue'

type App = {
  database: PraetoriumDatabase
  /** Null on a single-replica instance, which needs none of it. */
  valkey: ValkeyClient | null
  service: PraetoriumService
  events: BattleEvents
  /** Loaded on first use, and null on an instance with no catalogue data synced. */
  catalogue: () => LoadedCatalogue | null
  /** The validated, source-independent reference data compiled into the snapshot. */
  canonicalCatalogue: () => CanonicalCatalogue | null
  /** Stratagems and mission cards, null when that source has not been synced. */
  rules: () => LoadedRules | null
  /** How the community data is doing, so the interface can say rather than guess. */
  sync: () => SyncState
  auth: ReturnType<typeof createAuth>
  email: ReturnType<typeof emailDelivery>
  telemetry: ReturnType<typeof serverTelemetry>
  /** Resolves after installed catalogue data has paid its one-time preparation cost. */
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
    const archive = process.env.CATALOGUE_SNAPSHOT_FILE?.trim()
    if (archive && installedSnapshot(directory)?.id !== catalogueLock.pointer.id) {
      try {
        installSnapshotArchive(directory, archive)
      } catch (error) {
        this.state = { status: 'failed', detail: error instanceof Error ? error.message : 'the offline catalogue could not be installed' }
        return
      }
    }
    const authoritativeReady = Boolean(installedSnapshot(directory))
    const mode = catalogueUpdateMode()
    if (mode === 'off') {
      this.state = authoritativeReady ? { status: 'ready', detail: null } : { status: 'absent', detail: null }
      return
    }
    const baseUrl = catalogueBaseUrl()
    const fetch = mode === 'pinned' ? fetchPinnedSnapshot : fetchCurrentSnapshot
    this.running = true
    this.state = authoritativeReady ? { status: 'ready', detail: null } : { status: 'working', detail: 'fetching the community data' }
    void fetch(directory, baseUrl, (message) => {
      if (!authoritativeReady) this.state = { status: 'working', detail: message }
    })
      .then(() => {
        this.state = { status: 'ready', detail: null }
        onReady()
      })
      .catch((error: unknown) => {
        this.state = installedSnapshot(directory)
          ? { status: 'ready', detail: null }
          : { status: 'failed', detail: error instanceof Error ? error.message : 'the fetch failed' }
      })
      .finally(() => {
        this.running = false
      })
  },
}

/** Pays the one-time preparation cost after startup, before a player opens the catalogue. */
export function warm(instance: Pick<App, 'catalogue' | 'canonicalCatalogue' | 'rules'>): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        prepareGlobalSearch(instance.catalogue(), instance.rules())
        instance.canonicalCatalogue()
      } catch (error) {
        sync.state = { status: 'failed', detail: error instanceof Error ? error.message : 'army data could not be loaded' }
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
    if (!realtime) throw new Error('Realtime secret is not configured')
    const events = new RealtimePublisher(realtime.apiUrl, realtime.apiKey)
    const email = emailDelivery()
    let ready = Promise.resolve()
    const instance: App = {
      database,
      valkey: cache,
      service: new PraetoriumService(new Repository(database), Date.now, events, randomInt),
      events,
      auth: createAuth(database, persistedSecret({ directory: dataDirectory }), cache ? valkeySecondaryStorage(cache) : undefined, email),
      email,
      catalogue: memoize(loadCatalogue),
      canonicalCatalogue: memoize(loadCanonicalCatalogue),
      rules: memoize(() => {
        const catalogue = instance.catalogue()
        return loadRules(undefined, undefined, undefined, undefined, catalogue?.datacards, catalogue?.sourceReferences)
      }),
      sync: () => sync.state,
      telemetry,
      ready: () => ready,
    }
    // Fetched in the background rather than at boot: an instance must start and
    // serve battles whether or not it has the catalogues yet.
    sync.begin(catalogueDirectory(dataDirectory), () => {
      instance.catalogue = memoize(loadCatalogue)
      instance.canonicalCatalogue = memoize(loadCanonicalCatalogue)
      instance.rules = memoize(() => {
        const catalogue = instance.catalogue()
        return loadRules(undefined, undefined, undefined, undefined, catalogue?.datacards, catalogue?.sourceReferences)
      })
      ready = warm(instance)
    })
    const catalogueRefresh = setInterval(
      () =>
        sync.begin(catalogueDirectory(dataDirectory), () => {
          instance.catalogue = memoize(loadCatalogue)
          instance.canonicalCatalogue = memoize(loadCanonicalCatalogue)
          instance.rules = memoize(() => {
            const catalogue = instance.catalogue()
            return loadRules(undefined, undefined, undefined, undefined, catalogue?.datacards, catalogue?.sourceReferences)
          })
          ready = warm(instance)
        }),
      60 * 60 * 1000,
    )
    catalogueRefresh.unref()
    if (sync.state.status === 'ready') ready = warm(instance)
    return instance
  })
}
