import fs from 'node:fs'
import path from 'node:path'
import { hash } from 'node:crypto'
import { setPriority } from 'node:os'
import { catalogueSources, SNAPSHOT_SOURCE_NAMES, isSnapshotSourceName } from '../src/server/catalogueSources'
import { editionMfmVersions, readCatalogueComposition, validateEditionContinuity } from '../src/server/catalogueComposition'
import {
  catalogueBaseUrl,
  fetchPinnedSnapshot,
  catalogueLock,
  assertCatalogueSourcesAllowed,
  configuredCatalogueRevocations,
} from '../src/server/catalogueSnapshot'
import { privateR2Client } from '../src/server/r2Client'
import { fetchInto } from '../src/server/sync'
import { loadMfm, mfmVersions } from '../src/server/mfm'
import { catalogueChanges } from '../src/core/catalogueChanges'
import { appendHistory } from '../src/core/catalogueHistory'
import { CATALOGUE_HISTORY_FILE, loadCatalogueHistory, writeCatalogueHistory } from '../src/server/catalogueHistory'
import { materializeCatalogue } from './lib/catalogueMaterialize'
import { resolveCatalogueUpstream } from './lib/catalogueUpstream'
import { refreshLiveCatalogue } from './lib/liveCatalogue'
import { prepareCatalogueOutputs } from './lib/catalogueOutputs'
import { compiledChangeSource } from './lib/catalogueHistoryCompile'
import { publishLiveCatalogue } from './lib/liveCatalogueArchive'
import { liveCatalogueRevision } from '../src/server/liveCatalogue'

const root = process.env.CATALOGUE_LIVE_DIR
if (!root || !path.isAbsolute(root)) throw new Error('CATALOGUE_LIVE_DIR must be absolute')
const compiler = process.env.CATALOGUE_COMPILER
if (!compiler || !/^[a-f0-9]{64}$/.test(compiler)) throw new Error('CATALOGUE_COMPILER must name the bundled compiler')
const bootstrap = process.argv[2] === '--baseline'
if (process.argv.length > (bootstrap ? 3 : 2)) throw new Error('expected --baseline or no argument')
setPriority(10)
const terrainCache = process.env.CATALOGUE_BATTLEMASTER_CACHE?.trim() || path.join(root, 'battlemaster-cache')
process.env.CATALOGUE_BATTLEMASTER_CACHE = terrainCache
await refreshLiveCatalogue(
  root,
  async (staging, previous) => {
    const configured = readCatalogueComposition(path.resolve('catalogue'))
    let next = bootstrap
      ? { sources: catalogueSources, composition: configured }
      : await resolveCatalogueUpstream(catalogueSources, configured, console.log)
    const privateStore = Boolean(process.env.R2_ACCESS_KEY_ID || process.env.R2_SECRET_ACCESS_KEY) && Boolean(privateR2Client())
    let prior = previous ? path.join(previous.directory, 'catalogue') : (process.env.CATALOGUE_DIR ?? null)
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
    const sourceKey = hash('sha256', JSON.stringify({ sources: next.sources, composition }))
    if (previous && JSON.parse(fs.readFileSync(path.join(previous.directory, 'sources.json'), 'utf8')).key === sourceKey) return null
    const id = hash('sha256', `${previous?.id ?? 'initial'}:${sourceKey}`)
    fs.writeFileSync(path.join(staging, 'sources.json'), JSON.stringify({ key: sourceKey }))
    const directory = path.join(staging, 'catalogue')
    if (bootstrap && prior) fs.cpSync(prior, directory, { recursive: true })
    else
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
  },
  // Replicas of a deployment share one lock across compiler revisions; previews share their volume with unrelated
  // previews, so only those on the same compiler wait for each other.
  path.join(process.env.CATALOGUE_REFRESH_SCOPE === 'compiler' ? root : path.dirname(root), 'refresh.sqlite'),
)

// After activation, so a failed upload never costs a working catalogue.
const archiveTarget = process.env.CATALOGUE_LIVE_ARCHIVE
const live = archiveTarget ? liveCatalogueRevision(root) : null
if (archiveTarget && live) {
  try {
    const result = await publishLiveCatalogue(
      path.join(live.directory, 'catalogue'),
      archiveTarget,
      path.join(path.dirname(root), 'live-archive'),
    )
    // The next compiler starts from these sources, which are the ones a release prepares (`retainedCatalogueCache`).
    const { key } = JSON.parse(fs.readFileSync(path.join(live.directory, 'sources.json'), 'utf8')) as { key: string }
    fs.writeFileSync(path.join(path.dirname(root), 'live-sources'), key)
    console.log(`Live catalogue archive ${result}`)
  } catch (error) {
    console.error({ event: 'live_catalogue_archive_failed', error })
  }
}
