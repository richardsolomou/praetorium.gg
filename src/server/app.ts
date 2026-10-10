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
import { factionIndexFor, factionsFor } from '../shared/factionReferences'
import { battleDetachmentData, type BattleDetachmentData } from '../shared/battleDetachmentData'
import { githubSponsorRefresh, type GithubSponsorRefresh } from './githubSponsors'
import type { compiledGlobalSearchIndex } from './globalSearch'
import { catalogueEditionLoaders } from './catalogueEditions'
import { catalogueEditionId } from '../core/catalogueEdition'

type App = {
  hotReloadToken?: object
  health: () => Promise<void>
  service: PraetoriumService
  /** Loaded on first use, and null on an instance with no catalogue data synced. */
  catalogue: () => LoadedCatalogue | null
  catalogueFor: (catalogueId: string) => Promise<LoadedCatalogue | null>
  /** The validated, source-independent reference data compiled into the snapshot. */
  canonicalCatalogue: () => CanonicalCatalogue | null
  canonicalCatalogueFor: (catalogueId?: string) => Promise<CanonicalCatalogue | null>
  /** Stratagems and mission cards, null when that source has not been synced. */
  rules: () => LoadedRules | null
  rulesFor: (catalogueId?: string) => Promise<LoadedRules | null>
  battleMissionRulesFor: () => Promise<BattleMissionRules | null>
  battleReadRulesFor: () => Promise<BattleReadRules | null>
  terrainReadRulesFor: (matchupIds: readonly string[]) => Promise<TerrainReadRules | null>
  battleDetachmentDataFor: (catalogueId: string) => Promise<BattleDetachmentData | null>
  rosterLabelRulesFor: (catalogueId?: string) => Promise<Pick<LoadedRules, 'factionNames'> | null>
  /** What each army-data update changed, as the snapshot carries it; null when it carries none. */
  catalogueHistory: () => CatalogueHistoryEntry[] | null
  catalogueHistoryFor: () => Promise<CatalogueHistoryEntry[] | null>
  /** The simulator's all-factions picker, prepared once for the active snapshot. */
  combatUnits: () => ReturnType<typeof combatUnitsFor>
  combatUnitsFor: () => Promise<ReturnType<typeof combatUnitsFor>>
  factionIndexFor: () => Promise<ReturnType<typeof factionIndexFor> | null>
  factionsFor: () => Promise<ReturnType<typeof factionsFor> | null>
  factionFor: (catalogueId: string) => Promise<ReturnType<typeof factionsFor>['factions'][number] | null>
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
  /** Mirrors GitHub's sponsor list into auth storage; a no-op without `GITHUB_SPONSORS_TOKEN`. */
  githubSponsors: GithubSponsorRefresh
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

const hotReloadToken = {}

function catalogueLoaders(directory: string) {
  const catalogue = memoize(() => loadCatalogue(directory))
  const rules = memoize(() => loadRules(directory, undefined, undefined, undefined, catalogue()?.datacards))
  const editions = catalogueEditionLoaders(directory, catalogue, rules)
  return {
    catalogue,
    editions,
    canonical: memoize(() => editions.canonicalCatalogue(referenceCatalogue(directory, catalogue, rules))),
    rules,
    history: memoize(() => loadCatalogueHistory(directory)),
    combatUnits: memoize(() => editions.combatUnits()),
    searchIndex: memoize(() => editions.searchIndex()),
  }
}

function catalogueReads(getInstance: () => App, loaded: ReturnType<typeof catalogueLoaders>) {
  const versions = () => loaded.editions
  return {
    catalogueFor: async (catalogueId: string) => versions().catalogueFor(catalogueId),
    canonicalCatalogueFor: async (catalogueId?: string) =>
      catalogueId && catalogueEditionId(versions().resolve(catalogueId))
        ? versions().canonicalFor(catalogueId)
        : getInstance().canonicalCatalogue(),
    rulesFor: async (catalogueId?: string) => versions().rulesFor(catalogueId),
    battleMissionRulesFor: async () => getInstance().rules(),
    battleReadRulesFor: async () => getInstance().rules(),
    terrainReadRulesFor: async (matchupIds: readonly string[]) => {
      const rules = getInstance().rules()
      return rules
        ? {
            terrainTemplates: rules.terrainTemplates,
            terrainLayouts: rules.terrainLayouts.filter((layout) => matchupIds.includes(layout.matchupId)),
          }
        : null
    },
    battleDetachmentDataFor: async (catalogueId: string) => {
      const catalogue = versions().catalogueFor(catalogueId)
      const rules = versions().rulesFor(catalogueId)
      return catalogue && rules ? battleDetachmentData(catalogue, rules, catalogueId) : null
    },
    rosterLabelRulesFor: async (catalogueId?: string) => versions().rulesFor(catalogueId),
    catalogueHistoryFor: async () => getInstance().catalogueHistory(),
    combatUnitsFor: async () => getInstance().combatUnits(),
    factionIndexFor: async () => {
      const data = versions().factions()
      return data
        ? {
            revision: data.revision,
            factions: data.factions.map(
              ({ armyRules: _armyRules, referenceDetachmentIds: _referenceDetachmentIds, detachments, ...faction }) => ({
                ...faction,
                detachments: detachments.map(({ id, name, referenceRoute }) => ({ id, name, referenceRoute })),
              }),
            ),
          }
        : null
    },
    factionsFor: async () => {
      return versions().factions()
    },
    factionFor: async (catalogueId: string) => versions().factionFor(catalogueId),
    factionIconFor: async (id: string) => getInstance().rules()?.factionIcons.get(id) ?? null,
    searchIndexFor: async () => {
      return loaded.searchIndex()
    },
  }
}

function useCatalogueLoaders(instance: App, directory: string) {
  const next = catalogueLoaders(directory)
  instance.catalogue = next.catalogue
  instance.canonicalCatalogue = next.canonical
  instance.rules = next.rules
  instance.catalogueHistory = next.history
  instance.combatUnits = next.combatUnits
  Object.assign(
    instance,
    catalogueReads(() => instance, next),
  )
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
    const accounts = new SqliteAccountRepository(authDatabase)
    const repository = new SpacetimeRepository(accounts, operator)
    const githubSponsors = githubSponsorRefresh(process.env.GITHUB_SPONSORS_TOKEN?.trim() || undefined, (sponsors) =>
      accounts.replaceGithubSponsors(sponsors),
    )
    const push = pushSenderFromEnvironment((tokens) => repository.deletePushTokens(tokens))
    let ready = Promise.resolve()
    const loaded = catalogueLoaders(catalogueDataDirectory)
    const authOptions = {
      environment: process.env,
      email,
      deleteUserData: (userId: string) => operator.deleteUserData(userId),
      revokeSessionAccess: (sessionId: string) => operator.revokeSession(sessionId),
      storeSocialAvatar: storeProfileImageFromUrl,
      updateProfile: profileUpdate,
      githubLinked: () => githubSponsors.refresh(),
      captureAuthentication: (userId: string, event: 'account_created' | 'account_signed_in', properties: { method: string }) =>
        telemetry.capture(userId, event, properties),
    }
    const auth = createSqliteAuth(authDatabase, process.env.AUTH_SECRET ?? '', authOptions)
    const instance: App = {
      hotReloadToken,
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
      canonicalCatalogue: loaded.canonical,
      rules: loaded.rules,
      catalogueHistory: loaded.history,
      combatUnits: loaded.combatUnits,
      ...catalogueReads(() => instance, loaded),
      push: Boolean(push),
      sync: () => sync.state,
      telemetry,
      githubSponsors,
      ready: () => ready,
    }
    // Everything read from the snapshot is read again from the one now on disk.
    const swap = () => {
      useCatalogueLoaders(instance, catalogueDataDirectory)
      ready = warm(instance)
    }
    sync.begin(catalogueDataDirectory, swap)
    const catalogueRefresh = setInterval(() => sync.begin(catalogueDataDirectory, swap), 60 * 60 * 1000)
    catalogueRefresh.unref()
    // Hourly, because a one-time sponsorship ends without GitHub announcing it.
    const refreshSponsors = () =>
      void githubSponsors.refresh().catch((error: unknown) => {
        console.error('GitHub sponsor refresh failed:', error instanceof Error ? error.message : String(error))
      })
    if (githubSponsors.configured) {
      refreshSponsors()
      setInterval(refreshSponsors, 60 * 60 * 1000).unref()
    }
    if (sync.state.status === 'ready') ready = warm(instance)
    return instance
  }
  const instance = globalSingleton('praetorium.app', createApp)
  if (process.env.PRAETORIUM_LOCAL_DEV === 'true' && instance.hotReloadToken !== hotReloadToken) {
    useCatalogueLoaders(instance, catalogueDirectory(path.resolve(process.env.DATA_DIR ?? '/data')))
    instance.hotReloadToken = hotReloadToken
    const ready = warm(instance)
    instance.ready = () => ready
  }
  return instance
}
