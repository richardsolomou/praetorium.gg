import path from 'node:path'
import { randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
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
import { createD1Auth } from './d1Auth'
import { remoteD1 } from './d1Bridge'
import { D1AccountRepository } from './d1AccountRepository'
import { SpacetimeOperator } from './spacetimeOperator'
import { SpacetimeRepository } from './spacetimeRepository'
import { storeProfileImageFromUrl } from './avatarStorage'
import { profileUpdate } from './profile'
import { realtimeConfig } from '../adapters/realtime'
import { openValkey, type ValkeyClient, valkeyReachable, valkeySecondaryStorage, valkeyUrl } from '../adapters/valkey'
import { PraetoriumService } from './service'
import { emailDelivery } from '../adapters/email'
import { pushSenderFromEnvironment } from '../adapters/push'
import { pushNotifier, silentNotifier } from './pushNotifier'
import { prepareGlobalSearch } from './globalSearch'
import { referenceCatalogue } from './canonicalCatalogue'
import { loadCatalogueHistory } from './catalogueHistory'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import type { CatalogueHistoryEntry } from '../core/catalogueHistory'
import { combatUnitsFor } from './combatUnits'
import { factionIndexFor, factionsFor } from './factionReferences'
import { WorkerCatalogueStore } from './workerCatalogueStore'
import { compiledGlobalSearchIndex } from './globalSearch'

type App = {
  health: () => Promise<void>
  service: PraetoriumService
  events: BattleEvents
  /** Loaded on first use, and null on an instance with no catalogue data synced. */
  catalogue: () => LoadedCatalogue | null
  catalogueFor: (catalogueId: string) => Promise<LoadedCatalogue | null>
  /** The validated, source-independent reference data compiled into the snapshot. */
  canonicalCatalogue: () => CanonicalCatalogue | null
  canonicalCatalogueFor: () => Promise<CanonicalCatalogue | null>
  /** Stratagems and mission cards, null when that source has not been synced. */
  rules: () => LoadedRules | null
  rulesFor: () => Promise<LoadedRules | null>
  /** What each army-data update changed, as the snapshot carries it; null when it carries none. */
  catalogueHistory: () => CatalogueHistoryEntry[] | null
  catalogueHistoryFor: () => Promise<CatalogueHistoryEntry[] | null>
  /** The simulator's all-factions picker, prepared once for the active snapshot. */
  combatUnits: () => ReturnType<typeof combatUnitsFor>
  combatUnitsFor: () => Promise<ReturnType<typeof combatUnitsFor>>
  factionIndexFor: () => Promise<ReturnType<typeof factionIndexFor> | null>
  factionsFor: () => Promise<ReturnType<typeof factionsFor> | null>
  searchIndexFor: () => Promise<ReturnType<typeof compiledGlobalSearchIndex> | null>
  workerReferences: WorkerCatalogueStore | null
  /** How the community data is doing, so the interface can say rather than guess. */
  sync: () => SyncState
  auth: ReturnType<typeof createAuth> | ReturnType<typeof createD1Auth>
  spacetimeToken: ((headers: Headers) => Promise<string>) | null
  email: ReturnType<typeof emailDelivery>
  /** Whether this instance sends push notifications; nothing else depends on it. */
  push: boolean
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
export function warm(instance: Pick<App, 'catalogue' | 'canonicalCatalogue' | 'combatUnits' | 'rules'>): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        prepareGlobalSearch(instance.catalogue(), instance.rules())
        instance.canonicalCatalogue()
        instance.combatUnits()
      } catch (error) {
        sync.state = { status: 'failed', detail: error instanceof Error ? error.message : 'army data could not be loaded' }
      }
      resolve()
    })
  })
}

function canonicalCatalogue(instance: Pick<App, 'catalogue' | 'rules'>, directory: string) {
  return referenceCatalogue(directory, instance.catalogue, instance.rules)
}

export function app(): App {
  return globalSingleton('praetorium.app', () => {
    const telemetry = serverTelemetry()
    const dataDirectory = path.resolve(process.env.DATA_DIR ?? '/data')
    const catalogueDataDirectory = catalogueDirectory(dataDirectory)
    const email = emailDelivery()
    const hosted = Boolean(process.env.SPACETIME_URL)
    let database: PraetoriumDatabase | null = null
    let cache: ValkeyClient | null = null
    let operator: SpacetimeOperator | null = null
    const cloudflare = (
      globalThis as typeof globalThis & {
        __env__?: {
          AUTH_DB?: ReturnType<typeof remoteD1>
          CATALOGUE?: { get: (key: string) => Promise<{ size: number; arrayBuffer: () => Promise<ArrayBuffer> } | null> }
          CATALOGUE_SNAPSHOT_ID?: string
          CATALOGUE_MANIFEST_SHA256?: string
          CATALOGUE_READ_ACCESS_KEY_ID?: string
          CATALOGUE_READ_SECRET_ACCESS_KEY?: string
          CLOUDFLARE_ACCOUNT_ID?: string
          SPACETIME_ACCESS_CLIENT_ID?: string
          SPACETIME_ACCESS_CLIENT_SECRET?: string
        }
      }
    ).__env__
    const binding = hosted ? (cloudflare?.AUTH_DB ?? remoteD1()) : null
    const accessClientId = cloudflare?.SPACETIME_ACCESS_CLIENT_ID ?? process.env.SPACETIME_ACCESS_CLIENT_ID
    const accessClientSecret = cloudflare?.SPACETIME_ACCESS_CLIENT_SECRET ?? process.env.SPACETIME_ACCESS_CLIENT_SECRET
    const spacetimeAccess =
      accessClientId && accessClientSecret ? { clientId: accessClientId, clientSecret: accessClientSecret } : undefined
    const catalogueAccessKeyId = cloudflare?.CATALOGUE_READ_ACCESS_KEY_ID ?? process.env.CATALOGUE_READ_ACCESS_KEY_ID
    const catalogueSecretAccessKey = cloudflare?.CATALOGUE_READ_SECRET_ACCESS_KEY ?? process.env.CATALOGUE_READ_SECRET_ACCESS_KEY
    const catalogueBinding = cloudflare?.CATALOGUE
    const readCatalogue = catalogueBinding
      ? async (key: string, maxBytes: number) => {
          const object = await catalogueBinding.get(key)
          if (!object || object.size > maxBytes) throw new Error('Worker catalogue object unavailable')
          return object.arrayBuffer()
        }
      : hosted && cloudflare?.CLOUDFLARE_ACCOUNT_ID && catalogueAccessKeyId && catalogueSecretAccessKey
        ? (() => {
            const client = new S3Client({
              endpoint: `https://${cloudflare.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
              region: 'auto',
              forcePathStyle: true,
              credentials: {
                accessKeyId: catalogueAccessKeyId,
                secretAccessKey: catalogueSecretAccessKey,
              },
            })
            return async (key: string, maxBytes: number) => {
              const object = await client.send(new GetObjectCommand({ Bucket: 'praetorium-catalogue', Key: key }))
              if (!object.Body || (object.ContentLength ?? maxBytes + 1) > maxBytes) {
                throw new Error('Worker catalogue object unavailable')
              }
              const bytes = await object.Body.transformToByteArray()
              if (bytes.byteLength > maxBytes) throw new Error('Worker catalogue object unavailable')
              return bytes.slice().buffer
            }
          })()
        : null
    const workerCatalogue =
      hosted && readCatalogue
        ? new WorkerCatalogueStore(readCatalogue, cloudflare?.CATALOGUE_SNAPSHOT_ID ?? '', cloudflare?.CATALOGUE_MANIFEST_SHA256 ?? '')
        : null
    if (hosted) {
      operator = new SpacetimeOperator(
        process.env.SPACETIME_URL!,
        process.env.SPACETIME_DATABASE ?? '',
        process.env.SPACETIME_OPERATOR_TOKEN ?? '',
        (request) => fetch(request),
        spacetimeAccess,
      )
    } else {
      database = openDatabase(databaseUrl()).database
      const valkey = valkeyUrl()
      cache = valkey ? openValkey(valkey) : null
    }
    const realtime = hosted ? null : realtimeConfig()
    if (!hosted && !realtime) throw new Error('Realtime secret is not configured')
    const events: BattleEvents = realtime ? new RealtimePublisher(realtime.apiUrl, realtime.apiKey) : { publish: () => {} }
    const repository = hosted ? new SpacetimeRepository(new D1AccountRepository(binding), operator!) : new Repository(database!)
    const push = pushSenderFromEnvironment((tokens) => repository.deletePushTokens(tokens))
    let ready = Promise.resolve()
    let nativeSyncState: SyncState = { status: 'working', detail: 'loading the community data' }
    const workerShared = async () => {
      try {
        const [shared] = await Promise.all([workerCatalogue!.shared(), workerCatalogue!.referenceMetadata()])
        nativeSyncState = { status: 'ready', detail: null }
        return shared
      } catch (error) {
        nativeSyncState = { status: 'failed', detail: error instanceof Error ? error.message : 'army data could not be loaded' }
        throw error
      }
    }
    const loaders = () => ({
      catalogue: memoize(loadCatalogue),
      canonical: memoize(() => canonicalCatalogue(instance, catalogueDataDirectory)),
      rules: memoize(() => {
        const catalogue = instance.catalogue()
        return loadRules(undefined, undefined, undefined, undefined, catalogue?.datacards, catalogue?.sourceReferences)
      }),
      history: memoize(() => loadCatalogueHistory(catalogueDataDirectory)),
      combatUnits: memoize(() => {
        const catalogue = instance.catalogue()
        return catalogue ? combatUnitsFor(catalogue, instance.rules()) : []
      }),
    })
    const loaded = loaders()
    const auth = hosted
      ? createD1Auth(binding, process.env.AUTH_SECRET ?? '', {
          environment: process.env,
          email,
          deleteUserData: (userId) => operator!.deleteUserData(userId),
          revokeSessionAccess: (sessionId) => operator!.revokeSession(sessionId),
          storeSocialAvatar: storeProfileImageFromUrl,
          updateProfile: profileUpdate,
        })
      : createAuth(database!, persistedSecret({ directory: dataDirectory }), cache ? valkeySecondaryStorage(cache) : undefined, email)
    const instance: App = {
      health: async () => {
        if (hosted) {
          try {
            await Promise.all([binding.prepare('select 1').first(), operator!.health(), workerCatalogue ? workerShared() : undefined])
          } catch (error) {
            console.error('Hosted health check failed:', error instanceof Error ? error.message : String(error), {
              accessConfigured: Boolean(spacetimeAccess),
              accessClientIdType: typeof accessClientId,
              accessClientSecretType: typeof accessClientSecret,
              spacetimeHost: new URL(process.env.SPACETIME_URL!).host,
            })
            throw error
          }
        } else {
          await database!.execute(sql`select 1`)
          if (cache && !(await valkeyReachable(cache))) throw new Error('Valkey unavailable')
        }
      },
      service: new PraetoriumService(repository, Date.now, events, randomInt, push ? pushNotifier(repository, push) : silentNotifier),
      events,
      auth,
      spacetimeToken: hosted ? async (headers) => (await (auth as ReturnType<typeof createD1Auth>).api.getToken({ headers })).token : null,
      email,
      catalogue: loaded.catalogue,
      catalogueFor: async (catalogueId) => {
        if (!workerCatalogue) return instance.catalogue()
        await workerShared()
        return workerCatalogue.catalogue(catalogueId)
      },
      canonicalCatalogue: loaded.canonical,
      canonicalCatalogueFor: async () => (workerCatalogue ? null : instance.canonicalCatalogue()),
      rules: loaded.rules,
      rulesFor: async () => (workerCatalogue ? (await workerShared()).rules : instance.rules()),
      catalogueHistory: loaded.history,
      catalogueHistoryFor: async () => (workerCatalogue ? (await workerShared()).history : instance.catalogueHistory()),
      combatUnits: loaded.combatUnits,
      combatUnitsFor: async () => (workerCatalogue ? (await workerShared()).combatUnits : instance.combatUnits()),
      factionIndexFor: async () => {
        if (workerCatalogue) return (await workerShared()).factionIndex
        const catalogue = instance.catalogue()
        return catalogue ? factionIndexFor(catalogue, instance.rules()) : null
      },
      factionsFor: async () => {
        if (workerCatalogue) return (await workerShared()).factions
        const catalogue = instance.catalogue()
        return catalogue ? factionsFor(catalogue, instance.rules()) : null
      },
      searchIndexFor: async () => {
        if (workerCatalogue) return (await workerShared()).searchIndex
        const catalogue = instance.catalogue()
        return catalogue ? compiledGlobalSearchIndex(catalogue, instance.rules()) : null
      },
      workerReferences: workerCatalogue,
      push: Boolean(push),
      sync: () => (workerCatalogue ? nativeSyncState : sync.state),
      telemetry,
      ready: () => ready,
    }
    // Everything read from the snapshot is read again from the one now on disk.
    const swap = () => {
      const next = loaders()
      instance.catalogue = next.catalogue
      instance.canonicalCatalogue = next.canonical
      instance.rules = next.rules
      instance.catalogueHistory = next.history
      instance.combatUnits = next.combatUnits
      ready = warm(instance)
    }
    if (workerCatalogue) {
      ready = workerShared().then(
        () => {},
        () => {},
      )
    } else {
      // A self-hosted instance fetches a snapshot without blocking battle requests.
      sync.begin(catalogueDataDirectory, swap)
      const catalogueRefresh = setInterval(() => sync.begin(catalogueDataDirectory, swap), 60 * 60 * 1000)
      catalogueRefresh.unref()
      if (sync.state.status === 'ready') ready = warm(instance)
    }
    return instance
  })
}
