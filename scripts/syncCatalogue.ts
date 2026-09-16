/** Fetches the current verified snapshot, or refreshes it from every upstream for publication. */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  catalogueSourcesSchema,
  SOURCE_NAMES,
  type CatalogueSourceConfig,
  type ResolvedCatalogueSources,
} from '../src/server/catalogueSources'
import {
  activateCachedSnapshot,
  catalogueBaseUrl,
  catalogueLock,
  fetchCurrentPointer,
  fetchCurrentSnapshot,
  fetchPinnedSnapshot,
} from '../src/server/catalogueSnapshot'
import { isComplete, syncSources } from '../src/server/sync'

const root = path.join(import.meta.dirname, '..')
const sourcesFile = path.join(root, 'catalogue', 'sources.json')
const dataDirectory = process.env.CATALOGUE_DIR ?? path.join(root, 'catalogue-data')
const readSources = () => catalogueSourcesSchema.parse(JSON.parse(fs.readFileSync(sourcesFile, 'utf8')))
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

const head = (repository: string, branch: string) =>
  execFileSync('gh', ['api', `repos/${repository}/commits/${branch}`, '--jq', '.sha'], { encoding: 'utf8' }).trim()

async function responseBytes(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function resolve(config: CatalogueSourceConfig): Promise<ResolvedCatalogueSources> {
  const repositories = Object.fromEntries(
    SOURCE_NAMES.map((name) => [name, { ...config[name], revision: head(config[name].repository, config[name].branch) }]),
  ) as Pick<ResolvedCatalogueSources, (typeof SOURCE_NAMES)[number]>
  const catalogUrl = new URL('/v1.1/public/tts/layouts', config.battlemaster.baseUrl)
  catalogUrl.searchParams.set('owner', config.battlemaster.owner)
  catalogUrl.searchParams.set('missionPack', config.battlemaster.missionPack)
  catalogUrl.searchParams.set('text', '0')
  const catalog = JSON.parse(new TextDecoder().decode(await responseBytes(catalogUrl.toString()))) as { catalogKey?: unknown }
  if (typeof catalog.catalogKey !== 'string') throw new Error('Battlemaster catalog has no catalog key')

  return {
    ...repositories,
    battlemaster: { ...config.battlemaster, revision: hash(catalog.catalogKey) },
  }
}

const argument = process.argv[2]
if (argument === '--check') {
  readSources()
  console.log('catalogue source definitions are well formed')
} else if (argument === '--refresh' || argument === '--update') {
  const resolved = await resolve(readSources())
  await syncSources(dataDirectory, resolved, (message) => console.log(message))
  if (!isComplete(dataDirectory, resolved)) throw new Error('refusing to publish an incomplete catalogue snapshot')
} else if (argument === undefined || argument === '--latest') {
  const base = catalogueBaseUrl()
  const shared = process.env.CATALOGUE_CACHE_DIR?.trim()
  const cacheRoot =
    shared === 'off'
      ? null
      : path.resolve(
          shared || path.join(process.env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), '.cache'), 'praetorium', 'catalogues'),
        )
  if (!cacheRoot) {
    const fetch = argument === '--latest' ? fetchCurrentSnapshot : fetchPinnedSnapshot
    await fetch(dataDirectory, base, (message) => console.log(message))
  } else {
    const pointer = argument === '--latest' ? await fetchCurrentPointer(base) : catalogueLock.pointer
    const cached = path.join(cacheRoot, pointer.id)
    const fetch = argument === '--latest' ? fetchCurrentSnapshot : fetchPinnedSnapshot
    await fetch(cached, base, (message) => console.log(message))
    activateCachedSnapshot(dataDirectory, cached)
    console.log(`catalogue-data -> ${cached}`)
  }
} else {
  throw new Error('expected --check, --update, --latest, or no argument')
}
