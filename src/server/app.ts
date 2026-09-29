import path from 'node:path'
import { randomInt } from 'node:crypto'
import { globalSingleton } from 'ras-stack/server'
import { serverTelemetry } from '../adapters/posthog'
import { catalogueDirectory, type LoadedCatalogue, loadCatalogue } from './catalogueIndex'
import { type BattleMissionRules, type BattleReadRules, type LoadedRules, type TerrainReadRules, loadRules } from './rules'
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
import { createSqliteAuth } from './sqliteAuth'
import { SqliteAccountRepository } from './accountRepository'
import { localAuthDatabase } from './localAuthDatabase'
import { SpacetimeOperator } from './spacetimeOperator'
import { SpacetimeRepository } from './spacetimeRepository'
import { storeProfileImageFromUrl } from './avatarStorage'
import { profileUpdate } from './profile'
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
import { compiledGlobalSearchIndex } from './globalSearch'
import { battleDetachmentData, type BattleDetachmentData } from './battleDetachmentData'

type App = {
  health: () => Promise<void>
  service: PraetoriumService
  /** Loaded on first use, and null on an instance with no catalogue data synced. */
  catalogue: () => LoadedCatalogue | null
  catalogueFor: (catalogueId: string) => Promise<LoadedCatalogue | null>
  /** The validated, source-independent reference data compiled into the snapshot. */
  canonicalCatalogue: () => CanonicalCatalogue | null
  canonicalCatalogueFor: () => Promise<CanonicalCatalogue | null>
  /** Stratagems and mission cards, null when that source has not been synced. */
  rules: () => LoadedRules | null
  rulesFor: () => Promise<LoadedRules | null>
  battleMissionRulesFor: () => Promise<BattleMissionRules | null>
  battleReadRulesFor: () => Promise<BattleReadRules | null>
  terrainReadRulesFor: (matchupIds: readonly string[]) => Promise<TerrainReadRules | null>
  battleDetachmentDataFor: (catalogueId: string) => Promise<BattleDetachmentData | null>
  rosterLabelRulesFor: () => Promise<Pick<LoadedRules, 'factionNames'> | null>
  /** What each army-data update changed, as the snapshot carries it; null when it carries none. */
  catalogueHistory: () => CatalogueHistoryEntry[] | null
  catalogueHistoryFor: () => Promise<CatalogueHistoryEntry[] | null>
  /** The simulator's all-factions picker, prepared once for the active snapshot. */
  combatUnits: () => ReturnType<typeof combatUnitsFor>
  combatUnitsFor: () => Promise<ReturnType<typeof combatUnitsFor>>
  factionIndexFor: () => Promise<ReturnType<typeof factionIndexFor> | null>
  factionsFor: () => Promise<ReturnType<typeof factionsFor> | null>
  factionIconFor: (id: string) => Promise<string | null>
  searchIndexFor: () => Promise<ReturnType<typeof compiledGlobalSearchIndex> | null>
  /** How the community data is doing, so the interface can say rather than guess. */
  sync: () => SyncState
  auth: ReturnType<typeof createSqliteAuth>
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
  const createApp = (): App => {
    const telemetry = serverTelemetry()
    const dataDirectory = path.resolve(process.env.DATA_DIR ?? '/data')
    const catalogueDataDirectory = catalogueDirectory(dataDirectory)
    const email = emailDelivery()
    const localAuth = localAuthDatabase(process.env.AUTH_SQLITE_PATH ?? '')
    const authDatabase = localAuth.database
    const accessClientId = process.env.SPACETIME_ACCESS_CLIENT_ID
    const accessClientSecret = process.env.SPACETIME_ACCESS_CLIENT_SECRET
    const spacetimeAccess =
      accessClientId && accessClientSecret ? { clientId: accessClientId, clientSecret: accessClientSecret } : undefined
    const operator = new SpacetimeOperator(
      process.env.SPACETIME_URL ?? '',
      process.env.SPACETIME_DATABASE ?? '',
      process.env.SPACETIME_OPERATOR_TOKEN ?? '',
      (request, init) => fetch(request, init),
      spacetimeAccess,
      process.env.SPACETIME_INTERNAL_HOST,
    )
    const repository = new SpacetimeRepository(new SqliteAccountRepository(authDatabase), operator)
    const push = pushSenderFromEnvironment((tokens) => repository.deletePushTokens(tokens))
    let ready = Promise.resolve()
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
    const authOptions = {
      environment: process.env,
      email,
      deleteUserData: (userId: string) => operator.deleteUserData(userId),
      revokeSessionAccess: (sessionId: string) => operator.revokeSession(sessionId),
      storeSocialAvatar: storeProfileImageFromUrl,
      updateProfile: profileUpdate,
    }
    const auth = createSqliteAuth(authDatabase, process.env.AUTH_SECRET ?? '', authOptions)
    const instance: App = {
      health: async () => {
        try {
          await ready
          if (sync.state.status !== 'ready') throw new Error(`Catalogue ${sync.state.status}`)
          await Promise.all([localAuth.client.execute('select 1'), operator.health()])
        } catch (error) {
          console.error('Hosted health check failed:', error instanceof Error ? error.message : String(error), {
            accessConfigured: Boolean(spacetimeAccess),
          })
          throw error
        }
      },
      service: new PraetoriumService(repository, Date.now, randomInt, push ? pushNotifier(repository, push) : silentNotifier, () =>
        operator.publicStandingsRevision(),
      ),
      auth,
      spacetimeToken: async (headers) => (await auth.api.getToken({ headers })).token,
      email,
      catalogue: loaded.catalogue,
      catalogueFor: async () => instance.catalogue(),
      canonicalCatalogue: loaded.canonical,
      canonicalCatalogueFor: async () => instance.canonicalCatalogue(),
      rules: loaded.rules,
      rulesFor: async () => instance.rules(),
      battleMissionRulesFor: async () => instance.rules(),
      battleReadRulesFor: async () => instance.rules(),
      terrainReadRulesFor: async (matchupIds) => {
        const rules = instance.rules()
        return rules
          ? {
              terrainTemplates: rules.terrainTemplates,
              terrainLayouts: rules.terrainLayouts.filter((layout) => matchupIds.includes(layout.matchupId)),
            }
          : null
      },
      battleDetachmentDataFor: async (catalogueId) => {
        const catalogue = instance.catalogue()
        const rules = instance.rules()
        return catalogue && rules ? battleDetachmentData(catalogue, rules, catalogueId) : null
      },
      rosterLabelRulesFor: async () => instance.rules(),
      catalogueHistory: loaded.history,
      catalogueHistoryFor: async () => instance.catalogueHistory(),
      combatUnits: loaded.combatUnits,
      combatUnitsFor: async () => instance.combatUnits(),
      factionIndexFor: async () => {
        const catalogue = instance.catalogue()
        return catalogue ? factionIndexFor(catalogue, instance.rules()) : null
      },
      factionsFor: async () => {
        const catalogue = instance.catalogue()
        return catalogue ? factionsFor(catalogue, instance.rules()) : null
      },
      factionIconFor: async (id) => instance.rules()?.factionIcons.get(id) ?? null,
      searchIndexFor: async () => {
        const catalogue = instance.catalogue()
        return catalogue ? compiledGlobalSearchIndex(catalogue, instance.rules()) : null
      },
      push: Boolean(push),
      sync: () => sync.state,
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
    sync.begin(catalogueDataDirectory, swap)
    const catalogueRefresh = setInterval(() => sync.begin(catalogueDataDirectory, swap), 60 * 60 * 1000)
    catalogueRefresh.unref()
    if (sync.state.status === 'ready') ready = warm(instance)
    return instance
  }
  return globalSingleton('praetorium.app', createApp)
}
