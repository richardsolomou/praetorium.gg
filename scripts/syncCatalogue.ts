/** Fetches the current verified snapshot, or refreshes it from every upstream for publication. */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  catalogueSourcesSchema,
  SOURCE_NAMES,
  type CatalogueSourceConfig,
  type ResolvedCatalogueSources,
} from '../src/server/catalogueSources'
import { DEFAULT_CATALOGUE_SNAPSHOT_BASE_URL, fetchCurrentSnapshot } from '../src/server/catalogueSnapshot'
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

  const files: Record<string, string> = {}
  let wahapediaRevision = ''
  for (const name of config.wahapedia.files) {
    // Deliberately sequential: this updater runs hourly and should not burst at public sources.
    const bytes = await responseBytes(`${config.wahapedia.baseUrl}/${name}`)
    files[name] = hash(bytes)
    if (name === 'Last_update.csv') wahapediaRevision = new TextDecoder().decode(bytes).split('\n')[1]?.replace('|', '').trim() ?? ''
  }
  const pages: Record<string, string> = {}
  for (const name of config.wahapedia.pages) {
    pages[name] = hash(await responseBytes(`${config.wahapedia.baseUrl}/factions/${name}/`))
  }
  if (!wahapediaRevision) throw new Error('Wahapedia export has no revision')

  return {
    ...repositories,
    battlemaster: { ...config.battlemaster, revision: hash(catalog.catalogKey) },
    wahapedia: {
      ...config.wahapedia,
      revision: `${wahapediaRevision} + pinned live pages`,
      files,
      pages,
    },
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
} else {
  const base = process.env.CATALOGUE_SNAPSHOT_BASE_URL || DEFAULT_CATALOGUE_SNAPSHOT_BASE_URL
  await fetchCurrentSnapshot(dataDirectory, base, (message) => console.log(message))
}
