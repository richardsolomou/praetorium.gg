import fs from 'node:fs'
import path from 'node:path'
import { hash } from 'node:crypto'
import { catalogueSources, SNAPSHOT_SOURCE_NAMES, isSnapshotSourceName } from '../../src/server/catalogueSources'
import { editionMfmVersions, readCatalogueComposition, validateEditionContinuity } from '../../src/server/catalogueComposition'
import {
  catalogueBaseUrl,
  fetchPinnedSnapshot,
  catalogueLock,
  assertCatalogueSourcesAllowed,
  configuredCatalogueRevocations,
} from '../../src/server/catalogueSnapshot'
import { privateR2Client } from '../../src/server/r2Client'
import { fetchInto } from '../../src/server/sync'
import { loadMfm, mfmVersions } from '../../src/server/mfm'
import { catalogueChanges } from '../../src/core/catalogueChanges'
import { appendHistory } from '../../src/core/catalogueHistory'
import { CATALOGUE_HISTORY_FILE, loadCatalogueHistory, writeCatalogueHistory } from '../../src/server/catalogueHistory'
import type { liveCatalogueRevision } from '../../src/server/liveCatalogue'
import { materializeCatalogue } from './catalogueMaterialize'
import { resolveCatalogueUpstream } from './catalogueUpstream'
import { prepareCatalogueOutputs } from './catalogueOutputs'
import { compiledChangeSource } from './catalogueHistoryCompile'
import { fetchLiveCatalogue } from './liveCatalogueArchive'

/** What a live revision's `sources.json` records: its source key and, after a refresh, the key it was refreshed from. */
export type LiveRevisionSources = { key: string; from?: string }

export const liveRevisionId = (previousId: string | null, sourceKey: string) => hash('sha256', `${previousId ?? 'initial'}:${sourceKey}`)

export const readLiveRevisionSources = (revision: string) =>
  JSON.parse(fs.readFileSync(path.join(revision, 'sources.json'), 'utf8')) as LiveRevisionSources

type Options = {
  /** Copy a first catalogue instead of following upstream: the published archive, else `CATALOGUE_DIR`, else the pinned snapshot. */
  bootstrap?: boolean
  /** The published live catalogue a bootstrap starts from when it was materialized with `authoring`. */
  archive?: { target: string; authoring: string }
}

/**
 * The `refreshLiveCatalogue` preparation for compiler `compiler`'s live root: follows the configured sources'
 * upstream branches from the previous revision, recording what changed in the catalogue history, and prepares
 * its server projections and browser downloads. Returns null when the sources have not moved.
 */
export function prepareLiveRevision(root: string, compiler: string, { bootstrap = false, archive }: Options = {}) {
  const terrainCache = process.env.CATALOGUE_BATTLEMASTER_CACHE?.trim() || path.join(root, 'battlemaster-cache')
  process.env.CATALOGUE_BATTLEMASTER_CACHE = terrainCache
  return async (staging: string, previous: ReturnType<typeof liveCatalogueRevision>) => {
    const configured = readCatalogueComposition(path.resolve('catalogue'))
    let next = bootstrap
      ? { sources: catalogueSources, composition: configured }
      : await resolveCatalogueUpstream(catalogueSources, configured, console.log)
    const privateStore = Boolean(process.env.R2_ACCESS_KEY_ID || process.env.R2_SECRET_ACCESS_KEY) && Boolean(privateR2Client())
    const directory = path.join(staging, 'catalogue')
    let prior = previous ? path.join(previous.directory, 'catalogue') : null
    if (bootstrap && !previous && archive && privateStore) {
      try {
        if ((await fetchLiveCatalogue(archive.target, directory, archive.authoring))?.authoring === archive.authoring) {
          console.log(`Starting from the published ${archive.target} live catalogue`)
          prior = directory
        }
      } catch (error) {
        console.error({ event: 'live_catalogue_download_failed', error })
      }
      if (!prior) fs.rmSync(directory, { recursive: true, force: true })
    }
    prior ??= process.env.CATALOGUE_DIR ?? null
    if (!prior && privateStore) {
      prior = path.join(root, 'baseline')
      await fetchPinnedSnapshot(prior, catalogueBaseUrl(), console.log)
    }
    if (bootstrap && prior) {
      const held = readCatalogueComposition(prior)
      if (held?.baseSources) {
        const { baseSources, ...composition } = held
        next = { sources: baseSources, composition }
      }
    }
    const terrainRevision = prior && readCatalogueComposition(prior)?.baseSources?.battlemaster.revision
    if (prior && terrainRevision && fs.existsSync(path.join(prior, 'battlemaster/layouts'))) {
      const cached = path.join(terrainCache, terrainRevision)
      if (!fs.existsSync(cached)) {
        fs.mkdirSync(path.dirname(cached), { recursive: true })
        fs.cpSync(path.join(prior, 'battlemaster'), cached, { recursive: true })
      }
    }
    const composition = next.composition && {
      ...next.composition,
      editions: next.composition.editions.filter(
        (entry) =>
          !entry.snapshot ||
          privateStore ||
          (prior &&
            readCatalogueComposition(prior)?.editions.some(
              (held) => held.edition.id === entry.edition.id && held.snapshot?.id === entry.snapshot?.id,
            )),
      ),
    }
    // A bootstrap derives the key from the catalogue's own composition, which records exactly what a refresh resolved,
    // so a replica starting from a published catalogue finds unchanged upstream sources unchanged.
    const sourceKey = hash('sha256', JSON.stringify({ sources: next.sources, composition }))
    const previousKey = previous && readLiveRevisionSources(previous.directory).key
    if (previousKey === sourceKey) return null
    const id = liveRevisionId(previous?.id ?? null, sourceKey)
    const recorded: LiveRevisionSources = { key: sourceKey, ...(previousKey ? { from: previousKey } : {}) }
    fs.writeFileSync(path.join(staging, 'sources.json'), JSON.stringify(recorded))
    if (bootstrap && prior) {
      if (prior !== directory) fs.cpSync(prior, directory, { recursive: true })
    } else
      await materializeCatalogue(directory, next.sources, {
        composition,
        retainedDirectory: prior ?? undefined,
        patchesDirectory: path.resolve('catalogue/patches'),
        report: console.log,
      })
    if (!prior && composition && configured) {
      const baseline = path.join(staging, 'mfm-baseline')
      const versions = new Map<string, string>()
      for (const entry of configured.editions.filter((candidate) => !candidate.snapshot)) {
        const source = entry.sources.points ?? catalogueSources.points
        const target = path.join(baseline, hash('sha256', JSON.stringify(source)))
        if (!fs.existsSync(target)) await fetchInto(source.repository, source.revision, path.join(target, 'points'), source.path)
        versions.set(entry.edition.id, [...mfmVersions(loadMfm(target))].toSorted().join(', '))
      }
      validateEditionContinuity(
        {
          ...configured,
          baseSources: catalogueSources,
          editions: configured.editions.filter((entry) => composition.editions.some((held) => held.edition.id === entry.edition.id)),
        },
        readCatalogueComposition(directory),
        { previous: versions, next: editionMfmVersions(directory, composition) },
      )
      fs.rmSync(baseline, { recursive: true })
    }
    assertCatalogueSourcesAllowed(
      Object.keys(JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8'))).filter(isSnapshotSourceName),
      configuredCatalogueRevocations(),
    )
    if (prior && !bootstrap) {
      const before = readCatalogueComposition(prior)
      const after = readCatalogueComposition(directory)
      validateEditionContinuity(before, after, {
        previous: editionMfmVersions(prior, before),
        next: editionMfmVersions(directory, after),
      })
      console.log('Comparing catalogue history')
      const changing = new Set(composition?.editions.filter((entry) => entry.edition.status !== 'retired').map((entry) => entry.edition.id))
      const older = compiledChangeSource(prior, SNAPSHOT_SOURCE_NAMES, changing)
      const newer = compiledChangeSource(directory, SNAPSHOT_SOURCE_NAMES, changing)
      if (!older || !newer) throw new Error('Both catalogues must compile before a runtime refresh')
      const history = appendHistory(loadCatalogueHistory(prior) ?? [], {
        from: previous ? `upstream:${previous.id}` : catalogueLock.pointer.id,
        revisions: JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')),
        recordedAt: Date.now(),
        changes: catalogueChanges(older, newer),
      })
      writeCatalogueHistory(path.join(directory, CATALOGUE_HISTORY_FILE), history)
    }
    const publicDirectory = await prepareCatalogueOutputs(directory, staging, compiler)
    const manifestFile = path.join(publicDirectory, 'offline-reference-version.json')
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    const address = (value: string) => `/catalogue-assets/${path.basename(root)}/${path.basename(value)}`
    manifest.bundle = address(manifest.bundle)
    manifest.construction.current = address(manifest.construction.current)
    manifest.construction.complete = address(manifest.construction.complete)
    fs.writeFileSync(manifestFile, JSON.stringify(manifest))
    console.log(`Prepared live catalogue ${id}`)
    return id
  }
}
