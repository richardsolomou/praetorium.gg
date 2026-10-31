import { randomInt } from 'node:crypto'
import { globalSingleton } from 'ras-stack/server'
import os from 'node:os'
import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { deploymentHost, reportServerFailure, serverTelemetry } from '../adapters/posthog'
import { catalogueDirectory, type LoadedCatalogue, loadCatalogue } from './catalogueIndex'
import { type LoadedRules, loadRulesSteps } from './rules'
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
import { collectionPhotoStore, type CollectionPhotoStore } from './collectionPhotos'
import { PROFILE_PICTURE_QUESTIONS, photoScreening, type PhotoScreening, recordScreening } from './photoScreening'
import { privateObjects } from './privateImages'
import { profileUpdate } from './profile'
import { PraetoriumService } from './service'
import { emailDelivery } from '../adapters/email'
import { pushSenderFromEnvironment } from '../adapters/push'
import { pushNotifier, silentNotifier } from './pushNotifier'
import { productionCatalogueRuntime } from './catalogueRuntime'
import { referenceCatalogue } from './canonicalCatalogue'
import { loadCatalogueHistory } from './catalogueHistory'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import type { CatalogueHistoryEntry } from '../core/catalogueHistory'
import { combatUnitsFor } from '../shared/combatUnits'
import { publishedFaction } from './referenceCatalogue'
import { factionIndexFor, factionsFor } from '../shared/factionReferences'
import { battleDetachmentData, type BattleDetachmentData } from '../shared/battleDetachmentData'
import { githubSponsorRefresh, type GithubSponsorRefresh } from './githubSponsors'
import type { compiledGlobalSearchIndex } from './globalSearch'
import { catalogueEditionLoaders, type ConstructionScope } from './catalogueEditions'
import { reportRuntimeMetrics } from './runtimeMetrics'
import type { BattleFaction } from '../shared/battleSummary'
import { type Steps, stepThrough, stepwise } from '../shared/steps'

type App = {
  refreshCatalogue: () => void
  hotReloadToken?: object
  health: () => Promise<void>
  service: PraetoriumService
  repository: SpacetimeRepository
  collectionPhotos: CollectionPhotoStore
  /** Scores uploads for review without acting on them; null without `TYPESAFE_API_KEY`. */
  photoScreening: PhotoScreening | null
  /** Loaded on first use, and null on an instance with no catalogue data synced. */
  catalogue: () => LoadedCatalogue | null
  catalogueFor: (catalogueId: string) => Promise<LoadedCatalogue | null>
  /** The validated, source-independent reference data compiled into the snapshot. */
  canonicalCatalogue: () => CanonicalCatalogue | null
  canonicalCatalogueFor: (catalogueId?: string) => Promise<CanonicalCatalogue | null>
  /** Stratagems and mission cards, null when that source has not been synced. */
  rules: () => LoadedRules | null
  rulesFor: (catalogueId?: string) => Promise<LoadedRules | null>
  battleFactionsFor: () => Promise<BattleFaction[]>
  battleDetachmentDataFor: (catalogueId: string) => Promise<BattleDetachmentData | null>
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
  spacetimeGuestToken: (seatId: string, deviceHash: string) => Promise<string>
  email: ReturnType<typeof emailDelivery>
  /** Whether this instance sends push notifications; nothing else depends on it. */
  push: boolean
  telemetry: ReturnType<typeof serverTelemetry>
  /** Mirrors GitHub's sponsor list into auth storage; a no-op without `GITHUB_SPONSORS_TOKEN`. */
  githubSponsors: GithubSponsorRefresh
  /** Resolves after installed catalogue data has paid its one-time preparation cost. */
  ready: () => Promise<void>
  /** Builds what a faction's first request would otherwise build, a step at a time. */
  construction: (scope: ConstructionScope) => Steps<void>
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
  begin(directory: string, onReady: () => void, catalogue: () => LoadedCatalogue | null) {
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
    if (process.env.PRAETORIUM_LOCAL_DEV === 'true' || process.env.CATALOGUE_LIVE_DIR) {
      this.state = catalogue() ? { status: 'ready', detail: null } : { status: 'absent', detail: null }
      return
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
        reportServerFailure({ event: 'catalogue_refresh_failed', error })
        if (installedSnapshot(directory)) this.state = { status: 'ready', detail: null }
        else this.state = { status: 'failed', detail: error instanceof Error ? error.message : 'the fetch failed' }
      })
      .finally(() => {
        this.running = false
      })
  },
}

const SLICE_MS = 20
const nextTurn = () => yieldToEventLoop(undefined, { ref: false })

/**
 * Loads the projections every page needs, then resolves and builds each faction's construction
 * index. A faction costs seconds on a production replica, so the build runs in slices that let
 * requests in between, until a sync swap replaces these loaders.
 *
 * With `untilBuilt`, the returned promise waits for the serving build as well; `readiness` decides when.
 * The other editions build after it, since few requests read them.
 */
export async function warm(
  instance: Pick<App, 'searchIndexFor' | 'canonicalCatalogue' | 'combatUnits' | 'catalogue' | 'construction'>,
  untilBuilt = false,
) {
  await nextTurn()
  try {
    await instance.searchIndexFor()
    instance.canonicalCatalogue()
    instance.combatUnits()
    // Every reference read keys its cache on this catalogue's revision, so the first one would otherwise load it.
    instance.catalogue()
  } catch (error) {
    sync.state = { status: 'failed', detail: error instanceof Error ? error.message : 'army data could not be loaded' }
    return
  }
  // A browser-test stack opens a few factions, and building all of them starves the browsers sharing its runner.
  if (process.env.LOCAL_TEST_MODE === 'true') return
  const { construction } = instance
  const current = () => instance.construction === construction
  const failed = (error: unknown) => reportServerFailure({ event: 'catalogue_construction_failed', error })
  const serving = inBackground(construction('serving'), current).catch(failed)
  void serving.then(() => inBackground(construction('others'), current)).catch(failed)
  if (untilBuilt) await serving
}

/**
 * When the warm-up holds readiness: in production, until the first warm-up a replica answers readiness after
 * finishes its build, including one a live swap restarts mid-startup, so a new replica takes traffic only warm.
 * A swap on a replica already serving does not, because the health check would fail for the length of the build.
 */
export function readiness(start: (untilBuilt: boolean) => Promise<void>) {
  let current = Promise.resolve()
  let answered = false
  return {
    warm: () => {
      const next = (current = start(process.env.NODE_ENV === 'production' && !answered))
      void next.then(() => {
        if (current === next) answered = true
      })
    },
    /** Settles once the latest warm-up has, even if a swap replaced the one in progress while waiting. */
    ready: async () => {
      let awaited
      do {
        awaited = current
        await awaited
      } while (awaited !== current)
    },
  }
}

async function inBackground(steps: Steps<void>, current: () => boolean) {
  for (;;) {
    await nextTurn()
    if (!current()) return
    const deadline = performance.now() + SLICE_MS
    do if (steps.next().done) return
    while (performance.now() < deadline)
  }
}

const hotReloadToken = {}

function catalogueLoaders(directory: string) {
  const runtime = productionCatalogueRuntime(directory)
  const catalogue = memoize(() => loadCatalogue(directory))
  const baseRules = stepwise(() => loadRulesSteps(directory, { loadedDatacards: catalogue()?.datacards }))
  const rules = baseRules.get
  const editions = catalogueEditionLoaders(directory, catalogue, rules, runtime)
  function* construction(scope: ConstructionScope) {
    yield* stepThrough(baseRules)
    yield* editions.construction(scope)
  }
  return {
    catalogue,
    editions,
    construction,
    canonical: memoize(() => editions.canonicalCatalogue(runtime ? null : referenceCatalogue(directory, catalogue, rules))),
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
      catalogueId
        ? versions().pageCanonical(catalogueId, await versions().canonicalForRequest(catalogueId), () => getInstance().canonicalCatalogue())
        : getInstance().canonicalCatalogue(),
    rulesFor: async (catalogueId?: string) => versions().rulesFor(catalogueId),
    battleFactionsFor: async () => versions().battleFactions(),
    battleDetachmentDataFor: async (catalogueId: string) => {
      const catalogue = versions().catalogueFor(catalogueId)
      const rules = versions().rulesFor(catalogueId)
      return catalogue && rules ? battleDetachmentData(catalogue, rules, catalogueId) : null
    },
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
    factionsFor: async () => versions().factions(),
    factionFor: async (catalogueId: string) => {
      const faction = versions().factionFor(catalogueId)
      return faction ? publishedFaction(faction, versions().catalogueFor(faction.id)) : null
    },
    factionIconFor: async (id: string) => getInstance().rules()?.factionIcons.get(id) ?? null,
    searchIndexFor: async () => loaded.searchIndex(),
  }
}

/** Everything an instance reads from one catalogue directory, replaced together when the directory changes. */
const catalogueFields = (getInstance: () => App, loaded: ReturnType<typeof catalogueLoaders>) => ({
  catalogue: loaded.catalogue,
  canonicalCatalogue: loaded.canonical,
  rules: loaded.rules,
  catalogueHistory: loaded.history,
  combatUnits: loaded.combatUnits,
  construction: loaded.construction,
  ...catalogueReads(getInstance, loaded),
})

function useCatalogueLoaders(instance: App, directory: string) {
  Object.assign(
    instance,
    catalogueFields(() => instance, catalogueLoaders(directory)),
  )
}

export function app(): App {
  const createApp = (): App => {
    const telemetry = serverTelemetry()
    let catalogueDataDirectory = catalogueDirectory()
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
    const collectionPhotos = collectionPhotoStore(repository, () => privateObjects())
    const screening = process.env.TYPESAFE_API_KEY?.trim() ? photoScreening(process.env.TYPESAFE_API_KEY.trim()) : null
    const startup = readiness((untilBuilt) => warm(instance, untilBuilt))
    const loaded = catalogueLoaders(catalogueDataDirectory)
    const authOptions = {
      environment: process.env,
      email,
      deleteUserData: (userId: string) => operator.deleteUserData(userId),
      revokeSessionAccess: (sessionId: string) => operator.revokeSession(sessionId),
      storeSocialAvatar: storeProfileImageFromUrl,
      updateProfile: profileUpdate,
      profilePictureUploaded: (userId: string, image: string) =>
        void recordScreening(screening, image, PROFILE_PICTURE_QUESTIONS, (properties) =>
          telemetry.capture(userId, 'profile_picture_screened', properties),
        ),
      githubLinked: () => githubSponsors.refresh(),
      captureAuthentication: (userId: string, event: 'account_created' | 'account_signed_in', properties: { method: string }) =>
        telemetry.capture(userId, event, properties),
      captureSignInMethodAdded: (userId: string, provider: string) =>
        telemetry.capture(userId, 'sign_in_method_added', { provider, delivery: 'direct' }),
    }
    const auth = createSqliteAuth(authDatabase, process.env.AUTH_SECRET ?? '', authOptions)
    const instance: App = {
      hotReloadToken,
      health: async () => {
        try {
          await startup.ready()
          if (sync.state.status !== 'ready') throw new Error(`Catalogue ${sync.state.status}`)
          await Promise.all([localAuth.client.execute('select 1'), operator.health()])
        } catch (error) {
          reportServerFailure({ event: 'health_check_failed', accessConfigured: Boolean(spacetimeAccess), error })
          throw error
        }
      },
      repository,
      service: new PraetoriumService(repository, Date.now, randomInt, push ? pushNotifier(repository, push) : silentNotifier, () =>
        instance.battleFactionsFor(),
      ),
      auth,
      spacetimeToken: async (headers) => (await auth.api.getToken({ headers })).token,
      spacetimeGuestToken: auth.spacetimeGuestToken,
      email,
      refreshCatalogue: () => {
        const next = catalogueDirectory()
        if (next === catalogueDataDirectory) return
        useCatalogueLoaders(instance, next)
        catalogueDataDirectory = next
        startup.warm()
      },
      collectionPhotos,
      photoScreening: screening,
      ...catalogueFields(() => instance, loaded),
      push: Boolean(push),
      sync: () => sync.state,
      telemetry,
      githubSponsors,
      ready: startup.ready,
    }
    // Everything read from the snapshot is read again from the one now on disk.
    const swap = () => {
      useCatalogueLoaders(instance, catalogueDataDirectory)
      startup.warm()
    }
    sync.begin(catalogueDataDirectory, swap, instance.catalogue)
    const catalogueRefresh = setInterval(() => sync.begin(catalogueDataDirectory, swap, instance.catalogue), 60 * 60 * 1000)
    catalogueRefresh.unref()
    // Hourly, because a one-time sponsorship ends without GitHub announcing it.
    const refreshSponsors = () =>
      void githubSponsors.refresh().catch((error: unknown) => {
        reportServerFailure({ event: 'github_sponsor_refresh_failed', error })
      })
    if (githubSponsors.configured) {
      refreshSponsors()
      setInterval(refreshSponsors, 60 * 60 * 1000).unref()
    }
    let thumbnailsPending = true
    let maintainingPhotos = false
    const maintainPhotos = async () => {
      if (maintainingPhotos) return
      maintainingPhotos = true
      try {
        await collectionPhotos.drainDeletions()
        if (thumbnailsPending) {
          const result = await collectionPhotos.backfillThumbnails()
          thumbnailsPending = result.failed > 0
          console.info({ event: 'collection_photo_thumbnails_backfilled', ...result })
        }
      } catch (error) {
        reportServerFailure({ event: 'collection_photo_maintenance_failed', error })
      } finally {
        maintainingPhotos = false
      }
    }
    setInterval(() => void maintainPhotos(), 10 * 60 * 1000).unref()
    if (process.env.NODE_ENV === 'production')
      reportRuntimeMetrics((name, value, options) => void telemetry.metrics.gauge(name, value, options), {
        instance: os.hostname(),
        host: deploymentHost() ?? 'unknown',
      })
    if (sync.state.status === 'ready') startup.warm()
    void startup
      .ready()
      .then(maintainPhotos)
      .catch((error: unknown) => reportServerFailure({ event: 'collection_photo_maintenance_failed', error }))
    // A new release may offer different medals, and a new database has no stored ratings yet; both catch up in the background.
    void startup
      .ready()
      .then(async () => {
        await instance.service.syncAchievementDefinitions()
        await instance.service.refreshStandings()
      })
      .catch((error: unknown) => reportServerFailure({ event: 'derived_tables_refresh_failed', error }))
    return instance
  }
  const instance = globalSingleton('praetorium.app', createApp)
  if (process.env.CATALOGUE_LIVE_DIR) instance.refreshCatalogue()
  if (process.env.PRAETORIUM_LOCAL_DEV === 'true' && instance.hotReloadToken !== hotReloadToken) {
    useCatalogueLoaders(instance, catalogueDirectory())
    instance.hotReloadToken = hotReloadToken
    // Not warmed again here: rebuilding every catalogue projection after an edit held the
    // dev server's only thread for minutes, so each projection rebuilds when first read.
  }
  return instance
}
