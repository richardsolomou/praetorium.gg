/**
 * Fetches the community data at the revisions `catalogue/sources.json` pins, into a
 * working directory that is never committed.
 *
 *   --check    offline: validate sources.json only (runs in `pnpm check`)
 *   --update   move each source to the head of its branch and rewrite sources.json
 *
 * The fetching itself is `src/server/sync.ts`, the same code the server runs, so
 * development and production cannot drift.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { catalogueSourcesSchema, SOURCE_NAMES } from '../src/server/catalogueSources'
import { syncSources } from '../src/server/sync'

const sourcesFile = path.join(import.meta.dirname, '..', 'catalogue', 'sources.json')
const dataDirectory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')

const readSources = () => catalogueSourcesSchema.parse(JSON.parse(fs.readFileSync(sourcesFile, 'utf8')))

/** The head of a branch, through the `gh` CLI so the caller's existing auth is used. */
const head = (repository: string, branch: string) =>
  execFileSync('gh', ['api', `repos/${repository}/commits/${branch}`, '--jq', '.sha'], { encoding: 'utf8' }).trim()

const argument = process.argv[2]

if (argument === '--check') {
  readSources()
  console.log('catalogue sources are pinned and well formed')
} else if (argument === '--update') {
  const sources = readSources()
  for (const name of SOURCE_NAMES) {
    const source = sources[name]
    const latest = head(source.repository, source.branch)
    if (latest === source.revision) {
      console.log(`${name}: already at ${latest.slice(0, 10)}`)
      continue
    }
    console.log(`${name}: ${source.revision.slice(0, 10)} -> ${latest.slice(0, 10)}`)
    sources[name] = { ...source, revision: latest }
  }
  for (const name of Object.keys(sources.wahapedia.files)) {
    const response = await fetch(`${sources.wahapedia.baseUrl}/${name}`)
    if (!response.ok) throw new Error(`Wahapedia ${name} answered ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    sources.wahapedia.files[name] = createHash('sha256').update(bytes).digest('hex')
    if (name === 'Last_update.csv')
      sources.wahapedia.revision = new TextDecoder().decode(bytes).split('\n')[1]?.replace('|', '').trim() ?? ''
  }
  for (const name of Object.keys(sources.wahapedia.pages)) {
    const response = await fetch(`${sources.wahapedia.baseUrl}/factions/${name}/`)
    if (!response.ok) throw new Error(`Wahapedia ${name} page answered ${response.status}`)
    sources.wahapedia.pages[name] = createHash('sha256')
      .update(new Uint8Array(await response.arrayBuffer()))
      .digest('hex')
  }
  sources.wahapedia.revision = `${sources.wahapedia.revision.split(' + pinned live pages')[0]} + pinned live pages`
  fs.writeFileSync(sourcesFile, `${JSON.stringify(sources, null, 2)}\n`)
} else {
  await syncSources(dataDirectory, (message) => console.log(message))
}
